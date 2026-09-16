import { and, eq, sql } from "drizzle-orm"
import {
  databaseCommandAckSchema,
  databaseCommandExecutionAckSchema,
  databaseMutationChangesSchema,
  dataSourceCommandAckV3Schema,
  type DatabaseChangedAreaV2,
  type DatabaseCommand,
  type DatabaseCommandExecutionAck,
  type DatabaseCommandRequest,
  type DatabaseMutationChanges,
  type DatabaseMutationEventV2,
  type DataSourceCommandAckV3,
  type DataSourceMutationEventV3,
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
import type { RuntimeEnv } from "../../../shared/config/config"
import { createBackgroundTask } from "../../../infrastructure/background/contracts"
import { dispatchBackgroundTasks } from "../../../infrastructure/background/dispatch"
import { measureDatabaseOperation } from "../observability"
import {
  captureDatabaseAutomationMutationFacts,
  type DatabaseAutomationMutationFactCandidate,
} from "../automations/triggers/event-capture"
import { prepareDataSourceMutation } from "../core/commit"
import { publishCommittedDataSourceMutations } from "../realtime/outbox"

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
  automationFacts?: DatabaseAutomationMutationFactCandidate[]
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
  database?: Pick<Database, "delete" | "transaction">
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

function storedHostEvent(event: DatabaseMutationEventV2) {
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
    sourceId: null,
    streamKind: "host",
    version: event.version,
  }
}

function storedSourceEvent(event: DataSourceMutationEventV3) {
  return {
    actorId: event.actorId,
    areas: event.areas,
    changes: event.changes,
    commandId: event.commandId,
    committedAt: new Date(event.committedAt),
    databaseId: null,
    dataSourceId: event.sourceId,
    id: event.eventId,
    protocolVersion: event.protocolVersion,
    requiresReset: event.requiresReset === true,
    sourceId: event.sourceId,
    streamKind: "source",
    version: event.sourceVersion,
  }
}

type ExecuteDatabaseCommandInput = {
  actorId: string
  env?: RuntimeEnv
  request: DatabaseCommandRequest
  scope: DatabaseCommandScope
}

type CommandMutationResult<TResult> = {
  acknowledgement: DatabaseCommandExecutionAck<TResult>
  eventIds: string[]
  receiptEventId: string
  sourceEvents: DataSourceMutationEventV3[]
}

type CommandCommitResult<TResult> = CommandMutationResult<TResult> & {
  agentTriggerFacts: DatabaseAutomationMutationFactCandidate[]
  automationWindows: Array<{ availableAt: Date; id: string }>
}

async function loadCommandReceipt(tx: DatabaseTransaction, commandId: string) {
  const [receipt] = await tx
    .select()
    .from(databaseCommandReceipt)
    .where(eq(databaseCommandReceipt.commandId, commandId))
    .for("update")
    .limit(1)
  return receipt
}

function replayCommandReceipt<TResult>(
  receipt: NonNullable<Awaited<ReturnType<typeof loadCommandReceipt>>>,
  input: ExecuteDatabaseCommandInput,
  requestHash: string,
): CommandCommitResult<TResult> {
  const sameRequest = receipt.requestHash === requestHash &&
    receipt.databaseId === input.scope.databaseId &&
    receipt.dataSourceId === input.scope.dataSourceId &&
    receipt.actorId === input.actorId
  if (!sameRequest) throw new CommandIdReusedError(input.request.commandId)
  return {
    acknowledgement: databaseCommandExecutionAckSchema.parse(
      receipt.acknowledgement,
    ) as DatabaseCommandExecutionAck<TResult>,
    agentTriggerFacts: [],
    automationWindows: [],
    eventIds: [],
    receiptEventId: receipt.eventId,
    sourceEvents: [],
  }
}

async function bumpCommandClock(
  tx: DatabaseTransaction,
  scope: DatabaseCommandScope,
  now: Date,
) {
  if (scope.dataSourceId) {
    const [linked] = await tx
      .select({ dataSourceId: databaseDataSource.dataSourceId })
      .from(databaseDataSource)
      .where(and(
        eq(databaseDataSource.databaseId, scope.databaseId),
        eq(databaseDataSource.dataSourceId, scope.dataSourceId),
      ))
      .limit(1)
    if (!linked) throw new ServiceMutationError("Data source is not linked", 404)
    const [source] = await tx
      .update(dataSource)
      .set({ updatedAt: now, version: sql`${dataSource.version} + 1` })
      .where(eq(dataSource.id, scope.dataSourceId))
      .returning({ version: dataSource.version })
    if (!source) throw new ServiceMutationError("Data source not found", 404)
    return { primaryHostVersion: null, sourceVersion: source.version }
  }
  const [host] = await tx
    .update(database)
    .set({ version: sql`${database.version} + 1` })
    .where(eq(database.id, scope.databaseId))
    .returning({ version: database.version })
  if (!host) throw new ServiceMutationError("Database not found", 404)
  return { primaryHostVersion: host.version, sourceVersion: null }
}

async function dispatchCommand<TResult>(
  tx: DatabaseTransaction,
  input: ExecuteDatabaseCommandInput,
  dependencies: FrameworkDependencies,
  automationWindows: Array<{ availableAt: Date; id: string }>,
) {
  const dispatched = await dependencies.dispatch<TResult>({
    actorId: input.actorId,
    commandId: input.request.commandId,
    databaseId: input.scope.databaseId,
    dataSourceId: input.scope.dataSourceId,
    transaction: tx,
  }, input.request.command)
  const agentTriggerFacts = dispatched.automationFacts ?? []
  if (agentTriggerFacts.length) {
    await captureDatabaseAutomationMutationFacts(
      tx,
      agentTriggerFacts,
      input.env ? { capturedWindows: automationWindows } : {},
    )
  }
  return { agentTriggerFacts, dispatched }
}

async function persistSourceMutation<TResult>(
  tx: DatabaseTransaction,
  input: ExecuteDatabaseCommandInput,
  dispatched: DatabaseCommandDispatchResult<TResult>,
  sourceVersion: number | null,
  now: Date,
  randomUUID: () => string,
): Promise<CommandMutationResult<TResult>> {
  const sourceId = input.scope.dataSourceId
  if (!sourceId || sourceVersion === null || dispatched.mutations.length !== 1) {
    throw new Error("Data source command must produce one source mutation event")
  }
  const mutation = dispatched.mutations[0]!
  if (mutation.dataSourceId !== sourceId) {
    throw new Error("Data source command produced an event for another source")
  }
  const prepared = prepareDataSourceMutation(
    mutation.areas,
    mutation.changes,
    sourceId,
    sourceVersion,
    mutation.requiresReset,
  )
  const sourceEvent: DataSourceMutationEventV3 = {
    actorId: input.actorId,
    areas: prepared.areas,
    changes: prepared.changes,
    commandId: input.request.commandId,
    committedAt: now.toISOString(),
    eventId: randomUUID(),
    protocolVersion: 3,
    ...(prepared.requiresReset ? { requiresReset: true as const } : {}),
    sourceId,
    sourceVersion,
    type: "database.mutation",
  }
  await tx.insert(databaseMutationEvent).values(storedSourceEvent(sourceEvent))
  return {
    acknowledgement: dataSourceCommandAckV3Schema.parse({
      commandId: input.request.commandId,
      event: sourceEvent,
      result: dispatched.result,
    }) as DataSourceCommandAckV3<TResult>,
    eventIds: [sourceEvent.eventId],
    receiptEventId: sourceEvent.eventId,
    sourceEvents: [sourceEvent],
  }
}

function validateHostMutations(
  scope: DatabaseCommandScope,
  mutations: DatabaseCommandMutation[],
) {
  if (!mutations.some(({ databaseId }) => databaseId === scope.databaseId)) {
    throw new Error("Database command did not produce a host mutation event")
  }
  const hostIds = mutations.map(({ databaseId }) => databaseId)
  if (new Set(hostIds).size !== hostIds.length) {
    throw new Error("Database command produced multiple events for one host")
  }
}

async function hostMutationVersion(
  tx: DatabaseTransaction,
  mutation: DatabaseCommandMutation,
  scope: DatabaseCommandScope,
  primaryHostVersion: number | null,
) {
  if (mutation.databaseId === scope.databaseId && primaryHostVersion !== null) {
    return primaryHostVersion
  }
  const [host] = await tx
    .update(database)
    .set({ version: sql`${database.version} + 1` })
    .where(eq(database.id, mutation.databaseId))
    .returning({ version: database.version })
  if (!host) throw new ServiceMutationError("Database not found", 404)
  return host.version
}

function createHostMutationEvent(
  input: ExecuteDatabaseCommandInput,
  mutation: DatabaseCommandMutation,
  version: number,
  now: Date,
  randomUUID: () => string,
): DatabaseMutationEventV2 {
  const prepared = boundedChanges(mutation)
  const changes = prepared.changes.databases
    ? {
        ...prepared.changes,
        databases: prepared.changes.databases.map((host) =>
          host.id === mutation.databaseId ? { ...host, version } : host
        ),
      }
    : prepared.changes
  return {
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
  }
}

async function persistHostMutations<TResult>(
  tx: DatabaseTransaction,
  input: ExecuteDatabaseCommandInput,
  dispatched: DatabaseCommandDispatchResult<TResult>,
  primaryHostVersion: number | null,
  now: Date,
  randomUUID: () => string,
): Promise<CommandMutationResult<TResult>> {
  validateHostMutations(input.scope, dispatched.mutations)
  const events: DatabaseMutationEventV2[] = []
  const mutations = [...dispatched.mutations].sort((left, right) =>
    left.databaseId.localeCompare(right.databaseId)
  )
  for (const mutation of mutations) {
    const version = await hostMutationVersion(
      tx,
      mutation,
      input.scope,
      primaryHostVersion,
    )
    events.push(createHostMutationEvent(input, mutation, version, now, randomUUID))
  }
  await tx.insert(databaseMutationEvent).values(events.map(storedHostEvent))
  const primaryEvent = events.find(({ databaseId }) =>
    databaseId === input.scope.databaseId
  )!
  return {
    acknowledgement: databaseCommandAckSchema.parse({
      commandId: input.request.commandId,
      event: primaryEvent,
      result: dispatched.result,
    }) as DatabaseCommandExecutionAck<TResult>,
    eventIds: events.map(({ eventId }) => eventId),
    receiptEventId: primaryEvent.eventId,
    sourceEvents: [],
  }
}

async function persistCommandMutation<TResult>(
  tx: DatabaseTransaction,
  input: ExecuteDatabaseCommandInput,
  dispatched: DatabaseCommandDispatchResult<TResult>,
  versions: Awaited<ReturnType<typeof bumpCommandClock>>,
  now: Date,
  randomUUID: () => string,
) {
  return input.scope.dataSourceId
    ? persistSourceMutation(
        tx,
        input,
        dispatched,
        versions.sourceVersion,
        now,
        randomUUID,
      )
    : persistHostMutations(
        tx,
        input,
        dispatched,
        versions.primaryHostVersion,
        now,
        randomUUID,
      )
}

async function persistCommandBookkeeping<TResult>(
  tx: DatabaseTransaction,
  input: ExecuteDatabaseCommandInput,
  requestHash: string,
  now: Date,
  mutation: CommandMutationResult<TResult>,
) {
  await tx.insert(databaseRealtimeOutbox).values(
    mutation.eventIds.map((eventId) => ({ eventId, id: eventId })),
  )
  await tx.insert(databaseCommandReceipt).values({
    acknowledgement: mutation.acknowledgement,
    actorId: input.actorId,
    commandId: input.request.commandId,
    createdAt: now,
    databaseId: input.scope.databaseId,
    dataSourceId: input.scope.dataSourceId,
    eventId: mutation.receiptEventId,
    expiresAt: new Date(now.getTime() + COMMAND_RECEIPT_RETENTION_MS),
    requestHash,
  })
}

async function commitDatabaseCommand<TResult>(
  tx: DatabaseTransaction,
  input: ExecuteDatabaseCommandInput,
  dependencies: FrameworkDependencies,
  requestHash: string,
  now: Date,
  randomUUID: () => string,
): Promise<CommandCommitResult<TResult>> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${input.request.commandId}, 0))`,
  )
  const receipt = await loadCommandReceipt(tx, input.request.commandId)
  if (receipt) return replayCommandReceipt<TResult>(receipt, input, requestHash)

  const versions = await bumpCommandClock(tx, input.scope, now)
  const automationWindows: Array<{ availableAt: Date; id: string }> = []
  const { agentTriggerFacts, dispatched } = await dispatchCommand<TResult>(
    tx,
    input,
    dependencies,
    automationWindows,
  )
  const mutation = await persistCommandMutation(
    tx,
    input,
    dispatched,
    versions,
    now,
    randomUUID,
  )
  await persistCommandBookkeeping(tx, input, requestHash, now, mutation)
  return { ...mutation, agentTriggerFacts, automationWindows }
}

async function dispatchAgentTriggerFacts(
  env: RuntimeEnv,
  commandId: string,
  facts: DatabaseAutomationMutationFactCandidate[],
) {
  if (facts.length === 0) return
  try {
    const { dispatchDatabaseAgentMutationFacts } = await import(
      "../../ai/agents/agent-trigger-service"
    )
    await dispatchDatabaseAgentMutationFacts(env, {
      eventKeyPrefix: `database-command:${commandId}`,
      facts,
    })
  } catch (error) {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.name : "UnknownError",
      event: "custom_agent_database_trigger_dispatch_failed",
    }))
  }
}

async function publishCommandEffects<TResult>(
  input: ExecuteDatabaseCommandInput & { env: RuntimeEnv },
  committed: CommandCommitResult<TResult>,
  executor: Pick<Database, "delete" | "transaction">,
  metricAttributes: { operation: string; scope: "host" | "source" },
) {
  const retryEventIds = committed.sourceEvents.length > 0
    ? await publishCommittedDataSourceMutations(
        input.env,
        committed.sourceEvents,
        executor,
      )
    : committed.eventIds
  await measureDatabaseOperation("enqueue_duration_ms", metricAttributes, () =>
    dispatchBackgroundTasks(input.env, [
      ...retryEventIds.map((eventId) => createBackgroundTask({
        env: input.env,
        kind: "realtime.database",
        resourceId: eventId,
      })),
      ...committed.automationWindows.map((window) => createBackgroundTask({
        availableAt: window.availableAt,
        env: input.env,
        kind: "automation.event_window",
        resourceId: window.id,
      })),
    ]))
  await dispatchAgentTriggerFacts(
    input.env,
    input.request.commandId,
    committed.agentTriggerFacts,
  )
}

export async function executeDatabaseCommand<TResult = unknown>(
  input: ExecuteDatabaseCommandInput,
  dependencies: FrameworkDependencies,
): Promise<DatabaseCommandExecutionAck<TResult>> {
  const executor = dependencies.database ?? db
  const requestHash = await hashDatabaseCommandRequest(input.scope, input.request)
  const now = dependencies.now?.() ?? new Date()
  const randomUUID = dependencies.randomUUID ?? (() => crypto.randomUUID())
  const metricAttributes = {
    operation: input.request.command.type,
    scope: input.scope.dataSourceId ? "source" as const : "host" as const,
  }
  const committed = await measureDatabaseOperation(
    "commit_duration_ms",
    metricAttributes,
    () => executor.transaction((tx) =>
      commitDatabaseCommand<TResult>(
        tx,
        input,
        dependencies,
        requestHash,
        now,
        randomUUID,
      )
    ),
  )
  if (input.env && committed.eventIds.length > 0) {
    await publishCommandEffects(
      { ...input, env: input.env },
      committed,
      executor,
      metricAttributes,
    )
  }
  return committed.acknowledgement
}
