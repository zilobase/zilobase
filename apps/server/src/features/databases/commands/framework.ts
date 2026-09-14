import { and, eq, sql } from "drizzle-orm"
import {
  databaseCommandAckSchema,
  databaseMutationChangesSchema,
  type DatabaseChangedAreaV2,
  type DatabaseCommand,
  type DatabaseCommandAck,
  type DatabaseCommandRequest,
  type DatabaseMutationChanges,
  type DatabaseMutationEventV2,
} from "@zilobase/features/databases/contracts"

import { db, type Database } from "../../../infrastructure/database"
import {
  dataSource,
  database,
  databaseCommandReceipt,
  databaseDataSource,
  databaseMutationEvent,
  databaseRealtimeOutbox,
} from "../../../infrastructure/database/schema"
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error"

const COMMAND_RECEIPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000
const MAX_DATABASE_MUTATION_CHANGES_BYTES = 64 * 1_024

export type DatabaseCommandScope = {
  databaseId: string
  dataSourceId: string | null
}

export type DatabaseCommandMutation = {
  areas: DatabaseChangedAreaV2[]
  changes: DatabaseMutationChanges
  databaseId: string
  dataSourceId: string | null
  requiresReset?: true
}

export type DatabaseCommandDispatchResult<TResult = unknown> = {
  mutations: DatabaseCommandMutation[]
  result: TResult
}

export type DatabaseCommandContext = DatabaseCommandScope & {
  actorId: string
  commandId: string
  transaction: DatabaseTransaction
}

export type DatabaseCommandDispatcher = <TResult>(
  context: DatabaseCommandContext,
  command: DatabaseCommand,
) => Promise<DatabaseCommandDispatchResult<TResult>>

type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0]

type FrameworkDependencies = {
  database?: Pick<Database, "transaction">
  dispatch: DatabaseCommandDispatcher
  now?: () => Date
  randomUUID?: () => string
}

export class CommandIdReusedError extends ServiceMutationError {
  readonly code = "COMMAND_ID_REUSED"

  constructor(readonly commandId: string) {
    super("The command ID has already been used for another request", 409)
    this.name = "CommandIdReusedError"
  }
}

export class RowMoveConflictError extends ServiceMutationError {
  readonly code = "ROW_MOVE_CONFLICT"

  constructor(readonly rowId: string) {
    super("The row move anchors conflict with the current ordering", 409)
    this.name = "RowMoveConflictError"
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`
}

export async function hashDatabaseCommandRequest(
  scope: DatabaseCommandScope,
  request: DatabaseCommandRequest,
) {
  const bytes = new TextEncoder().encode(canonicalJson({ request, scope }))
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

function boundedChanges(mutation: DatabaseCommandMutation) {
  const changes = databaseMutationChangesSchema.parse(mutation.changes)
  const encoded = new TextEncoder().encode(JSON.stringify(changes))
  if (encoded.byteLength <= MAX_DATABASE_MUTATION_CHANGES_BYTES) {
    return { changes, requiresReset: mutation.requiresReset }
  }
  return { changes: {}, requiresReset: true as const }
}

function storedEvent(event: DatabaseMutationEventV2) {
  return {
    actorId: event.actorId,
    areas: event.areas,
    changes: event.changes,
    commandId: event.commandId,
    committedAt: new Date(event.committedAt),
    databaseId: event.databaseId,
    dataSourceId: event.dataSourceId,
    id: event.eventId,
    protocolVersion: event.protocolVersion,
    requiresReset: event.requiresReset === true,
    version: event.version,
  }
}

export async function executeDatabaseCommand<TResult = unknown>(
  input: {
    actorId: string
    request: DatabaseCommandRequest
    scope: DatabaseCommandScope
  },
  dependencies: FrameworkDependencies,
): Promise<DatabaseCommandAck<TResult>> {
  const executor = dependencies.database ?? db
  const requestHash = await hashDatabaseCommandRequest(input.scope, input.request)
  const now = dependencies.now?.() ?? new Date()
  const randomUUID = dependencies.randomUUID ?? (() => crypto.randomUUID())

  return executor.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.request.commandId}, 0))`)

    const [receipt] = await tx
      .select()
      .from(databaseCommandReceipt)
      .where(eq(databaseCommandReceipt.commandId, input.request.commandId))
      .for("update")
      .limit(1)

    if (receipt) {
      if (
        receipt.requestHash !== requestHash ||
        receipt.databaseId !== input.scope.databaseId ||
        receipt.dataSourceId !== input.scope.dataSourceId ||
        receipt.actorId !== input.actorId
      ) {
        throw new CommandIdReusedError(input.request.commandId)
      }
      return databaseCommandAckSchema.parse(receipt.acknowledgement) as DatabaseCommandAck<TResult>
    }

    let primaryHostVersion: number | null = null
    if (input.scope.dataSourceId) {
      const [linked] = await tx
        .select({ dataSourceId: databaseDataSource.dataSourceId })
        .from(databaseDataSource)
        .where(and(
          eq(databaseDataSource.databaseId, input.scope.databaseId),
          eq(databaseDataSource.dataSourceId, input.scope.dataSourceId),
        ))
        .limit(1)
      if (!linked) throw new ServiceMutationError("Data source is not linked", 404)

      const [versionedSource] = await tx
        .update(dataSource)
        .set({ version: sql`${dataSource.version} + 1` })
        .where(eq(dataSource.id, input.scope.dataSourceId))
        .returning({ version: dataSource.version })
      if (!versionedSource) throw new ServiceMutationError("Data source not found", 404)
    } else {
      const [versionedHost] = await tx
        .update(database)
        .set({ version: sql`${database.version} + 1` })
        .where(eq(database.id, input.scope.databaseId))
        .returning({ version: database.version })
      if (!versionedHost) throw new ServiceMutationError("Database not found", 404)
      primaryHostVersion = versionedHost.version
    }

    const dispatched = await dependencies.dispatch<TResult>({
      actorId: input.actorId,
      commandId: input.request.commandId,
      databaseId: input.scope.databaseId,
      dataSourceId: input.scope.dataSourceId,
      transaction: tx,
    }, input.request.command)

    if (
      dispatched.mutations.length === 0 ||
      !dispatched.mutations.some(({ databaseId }) => databaseId === input.scope.databaseId)
    ) {
      throw new Error("Database command did not produce a host mutation event")
    }

    const duplicateHost = dispatched.mutations.find((mutation, index, mutations) =>
      mutations.findIndex(({ databaseId }) => databaseId === mutation.databaseId) !== index
    )
    if (duplicateHost) {
      throw new Error("Database command produced multiple events for one host")
    }

    const events: DatabaseMutationEventV2[] = []
    for (const mutation of [...dispatched.mutations].sort((left, right) =>
      left.databaseId.localeCompare(right.databaseId)
    )) {
      const version = mutation.databaseId === input.scope.databaseId && primaryHostVersion !== null
        ? primaryHostVersion
        : (await tx
            .update(database)
            .set({ version: sql`${database.version} + 1` })
            .where(eq(database.id, mutation.databaseId))
            .returning({ version: database.version }))[0]?.version
      if (version === undefined) throw new ServiceMutationError("Database not found", 404)

      const prepared = boundedChanges(mutation)
      const changes = prepared.changes.databases
        ? {
            ...prepared.changes,
            databases: prepared.changes.databases.map((host) =>
              host.id === mutation.databaseId
                ? { ...host, version }
                : host
            ),
          }
        : prepared.changes
      events.push({
        actorId: input.actorId,
        areas: mutation.areas,
        changes,
        commandId: input.request.commandId,
        committedAt: now.toISOString(),
        databaseId: mutation.databaseId,
        dataSourceId: mutation.dataSourceId,
        eventId: randomUUID(),
        protocolVersion: 2,
        ...(prepared.requiresReset ? { requiresReset: true as const } : {}),
        type: "database.mutation",
        version,
      })
    }

    await tx.insert(databaseMutationEvent).values(events.map(storedEvent))
    await tx.insert(databaseRealtimeOutbox).values(events.map((event) => ({
      actorId: event.actorId,
      changed: [],
      committedAt: new Date(event.committedAt),
      databaseId: event.databaseId,
      delta: {},
      eventId: event.eventId,
      id: event.eventId,
      requiresRefetch: false,
      version: event.version,
    })))
    const primaryEvent = events.find(({ databaseId }) =>
      databaseId === input.scope.databaseId
    )!
    const acknowledgement = databaseCommandAckSchema.parse({
      commandId: input.request.commandId,
      event: primaryEvent,
      result: dispatched.result,
    }) as DatabaseCommandAck<TResult>

    await tx.insert(databaseCommandReceipt).values({
      acknowledgement,
      actorId: input.actorId,
      commandId: input.request.commandId,
      createdAt: now,
      databaseId: input.scope.databaseId,
      dataSourceId: input.scope.dataSourceId,
      eventId: primaryEvent.eventId,
      expiresAt: new Date(now.getTime() + COMMAND_RECEIPT_RETENTION_MS),
      requestHash,
    })

    return acknowledgement
  })
}
