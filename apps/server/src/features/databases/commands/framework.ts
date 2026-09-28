import { and, eq, inArray, sql } from "drizzle-orm";
import {
  databaseCommandAckSchema,
  databaseMutationChangesSchema,
  type DatabaseChangedAreaV2,
  type DatabaseCommand,
  type DatabaseCommandAck,
  type DatabaseCommandRequest,
  type DatabaseMutationChanges,
  type DatabaseMutationEventV2,
} from "@zilobase/features/databases/contracts";

import { db, runWithDb, type Database } from "../../../infrastructure/database";
import type { AfterCommit } from "../../../infrastructure/database/after-commit";
import {
  dataSource,
  database,
  databaseCommandReceipt,
  databaseActorState,
  databaseDataSource,
  databaseView,
  databaseMutationEvent,
  databaseRealtimeOutbox,
} from "../../../infrastructure/database/schema";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import type { RuntimeEnv } from "../../../shared/config/config";
import { createBackgroundTask } from "../../../infrastructure/background/contracts";
import { dispatchBackgroundTasks } from "../../../infrastructure/background/dispatch";
import { measureDatabaseOperation } from "../observability";
import { lockDatabaseRowOrdering } from "../core/position-service";
import {
  captureDatabaseAutomationMutationFacts,
  type DatabaseAutomationMutationFactCandidate,
} from "../../automations/triggers/event-capture";

const COMMAND_RECEIPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_DATABASE_MUTATION_CHANGES_BYTES = 64 * 1_024;

export type DatabaseCommandScope = {
  databaseId: string;
  dataSourceId: string | null;
};

export type DatabaseCommandMutation = {
  areas: DatabaseChangedAreaV2[];
  changes: DatabaseMutationChanges;
  databaseId: string;
  dataSourceId: string | null;
  requiresReset?: true;
};

export type DatabaseCommandDispatchResult<TResult = unknown> = {
  automationFacts?: DatabaseAutomationMutationFactCandidate[];
  mutations: DatabaseCommandMutation[];
  result: TResult;
};

export type DatabaseCommandContext = DatabaseCommandScope & {
  afterCommit?: AfterCommit;
  env?: RuntimeEnv;
  actorId: string;
  commandId: string;
  transaction: DatabaseTransaction;
};

export type DatabaseCommandDispatcher = <TResult>(
  context: DatabaseCommandContext,
  command: DatabaseCommand,
) => Promise<DatabaseCommandDispatchResult<TResult>>;

type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type FrameworkDependencies = {
  authorize?: () => Promise<void>;
  database?: Pick<Database, "transaction">;
  dispatch: DatabaseCommandDispatcher;
  now?: () => Date;
  randomUUID?: () => string;
};

export class CommandIdReusedError extends ServiceMutationError {
  readonly code = "COMMAND_ID_REUSED";

  constructor(readonly commandId: string) {
    super("The command ID has already been used for another request", 409);
    this.name = "CommandIdReusedError";
  }
}

export class RowMoveConflictError extends ServiceMutationError {
  readonly code = "ROW_MOVE_CONFLICT";

  constructor(readonly rowId: string) {
    super("The row move anchors conflict with the current ordering", 409);
    this.name = "RowMoveConflictError";
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

export async function hashDatabaseCommandRequest(
  scope: DatabaseCommandScope,
  request: DatabaseCommandRequest,
) {
  const bytes = new TextEncoder().encode(canonicalJson({ request, scope }));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function boundedChanges(mutation: DatabaseCommandMutation) {
  const changes = databaseMutationChangesSchema.parse(mutation.changes);
  const encoded = new TextEncoder().encode(JSON.stringify(changes));
  if (encoded.byteLength <= MAX_DATABASE_MUTATION_CHANGES_BYTES) {
    return { changes, requiresReset: mutation.requiresReset };
  }
  return { changes: {}, requiresReset: true as const };
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
  };
}

export async function executeDatabaseCommand<TResult = unknown>(
  input: {
    actorId: string;
    env?: RuntimeEnv;
    request: DatabaseCommandRequest;
    scope: DatabaseCommandScope;
  },
  dependencies: FrameworkDependencies,
): Promise<DatabaseCommandAck<TResult>> {
  const executor = dependencies.database ?? db;
  const requestHash = await hashDatabaseCommandRequest(input.scope, input.request);
  const now = dependencies.now?.() ?? new Date();
  const randomUUID = dependencies.randomUUID ?? (() => crypto.randomUUID());
  const automationWindows: Array<{ availableAt: Date; id: string }> = [];
  let agentTriggerFacts: DatabaseAutomationMutationFactCandidate[] = [];
  const deliveries: Array<() => Promise<unknown>> = [];

  const metricAttributes = {
    operation: input.request.command.type,
    scope: input.scope.dataSourceId ? ("source" as const) : ("host" as const),
  };
  const committed = await measureDatabaseOperation("commit_duration_ms", metricAttributes, () =>
    executor.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${input.request.commandId}, 0))`,
      );

      const [receipt] = await tx
        .select()
        .from(databaseCommandReceipt)
        .where(eq(databaseCommandReceipt.commandId, input.request.commandId))
        .for("update")
        .limit(1);

      if (receipt) {
        if (
          receipt.requestHash !== requestHash ||
          receipt.databaseId !== input.scope.databaseId ||
          receipt.dataSourceId !== input.scope.dataSourceId ||
          receipt.actorId !== input.actorId
        ) {
          throw new CommandIdReusedError(input.request.commandId);
        }
        return {
          acknowledgement: databaseCommandAckSchema.parse(
            receipt.acknowledgement,
          ) as DatabaseCommandAck<TResult>,
          eventIds: [] as string[],
        };
      }

      await runWithDb(tx, async () => {
        await dependencies.authorize?.();
      });
      let primaryHostVersion: number | null = null;
      const sourceVersions: Record<string, number> = {};
      if (input.scope.dataSourceId) {
        const transferSource =
          input.request.command.type === "row.place" ? input.request.command.source : undefined;
        const sourceIds = [
          ...new Set([
            input.scope.dataSourceId,
            ...(transferSource ? [transferSource.dataSourceId] : []),
          ]),
        ].sort();
        // Link validation and revision writes must observe the state after acquiring
        // the same source lanes used by concurrent link/unlink and host commands.
        for (const sourceId of sourceIds) await lockDatabaseRowOrdering(tx, sourceId);
        const [linked] = await tx
          .select({ dataSourceId: databaseDataSource.dataSourceId })
          .from(databaseDataSource)
          .where(
            and(
              eq(databaseDataSource.databaseId, input.scope.databaseId),
              eq(databaseDataSource.dataSourceId, input.scope.dataSourceId),
            ),
          )
          .limit(1);
        if (!linked) throw new ServiceMutationError("Data source is not linked", 404);

        if (transferSource) {
          const [sourceLink] = await tx
            .select()
            .from(databaseDataSource)
            .where(
              and(
                eq(databaseDataSource.databaseId, transferSource.databaseId),
                eq(databaseDataSource.dataSourceId, transferSource.dataSourceId),
              ),
            )
            .limit(1);
          if (!sourceLink) throw new ServiceMutationError("Source is not linked", 404);
        }
        for (const sourceId of sourceIds) {
          const [versionedSource] = await tx
            .update(dataSource)
            .set({ version: sql`${dataSource.version} + 1` })
            .where(eq(dataSource.id, sourceId))
            .returning({ version: dataSource.version });
          if (!versionedSource) throw new ServiceMutationError("Data source not found", 404);
          sourceVersions[sourceId] = versionedSource.version;
        }
      } else if (
        input.request.command.type !== "database.create" &&
        input.request.command.type !== "database.favorite"
      ) {
        // Host writes lock their linked sources before the host row. Source commands
        // later fan out host versions in sorted order, so the opposite order deadlocks.
        const lifecycle =
          input.request.command.type === "database.archive" ||
          input.request.command.type === "database.restore";
        let lockedSources: string[];
        if (lifecycle) {
          const [host] = await tx
            .select({ workspaceId: database.workspaceId })
            .from(database)
            .where(eq(database.id, input.scope.databaseId))
            .limit(1);
          if (!host) throw new ServiceMutationError("Database not found", 404);
          // A database tree can span multiple owned sources; reserve the workspace's
          // source lanes before discovering/mutating that tree inside domain services.
          lockedSources = (
            await tx
              .select({ id: dataSource.id })
              .from(dataSource)
              .where(eq(dataSource.workspaceId, host.workspaceId))
          ).map(({ id }) => id);
        } else {
          lockedSources = (
            await tx
              .select({ dataSourceId: databaseDataSource.dataSourceId })
              .from(databaseDataSource)
              .where(eq(databaseDataSource.databaseId, input.scope.databaseId))
          ).map(({ dataSourceId }) => dataSourceId);
          if ("dataSourceId" in input.request.command)
            lockedSources.push(input.request.command.dataSourceId);
        }
        for (const sourceId of [...new Set(lockedSources)].sort())
          await lockDatabaseRowOrdering(tx, sourceId);
        if (
          input.request.command.type === "view.update" &&
          input.request.command.patch.configuration?.some(({ path }) => path[0] === "subItems")
        ) {
          const [view] = await tx
            .select({ dataSourceId: databaseView.dataSourceId })
            .from(databaseView)
            .where(
              and(
                eq(databaseView.id, input.request.command.viewId),
                eq(databaseView.databaseId, input.scope.databaseId),
              ),
            )
            .limit(1);
          if (!view || !lockedSources.includes(view.dataSourceId))
            throw new ServiceMutationError("Database view not found", 404);
          const [source] = await tx
            .update(dataSource)
            .set({ version: sql`${dataSource.version} + 1` })
            .where(eq(dataSource.id, view.dataSourceId))
            .returning({ version: dataSource.version });
          if (!source) throw new ServiceMutationError("Data source not found", 404);
          sourceVersions[view.dataSourceId] = source.version;
        }
        const [versionedHost] = await tx
          .update(database)
          .set({ version: sql`${database.version} + 1` })
          .where(eq(database.id, input.scope.databaseId))
          .returning({ version: database.version });
        if (!versionedHost) throw new ServiceMutationError("Database not found", 404);
        primaryHostVersion = versionedHost.version;
      }

      const dispatched = await runWithDb(tx, () =>
        dependencies.dispatch<TResult>(
          {
            afterCommit: (operation) => deliveries.push(operation),
            env: input.env,
            actorId: input.actorId,
            commandId: input.request.commandId,
            databaseId: input.scope.databaseId,
            dataSourceId: input.scope.dataSourceId,
            transaction: tx,
          },
          input.request.command,
        ),
      );
      if (
        input.request.command.type === "database.archive" ||
        input.request.command.type === "database.restore"
      ) {
        const affected = dispatched.mutations.map(({ databaseId }) => databaseId);
        const sources = affected.length
          ? await tx
              .select({ id: dataSource.id })
              .from(dataSource)
              .where(inArray(dataSource.parentDatabaseId, affected))
          : [];
        for (const { id } of sources.sort((a, b) => a.id.localeCompare(b.id))) {
          const [source] = await tx
            .update(dataSource)
            .set({ version: sql`${dataSource.version} + 1` })
            .where(eq(dataSource.id, id))
            .returning({ version: dataSource.version });
          if (!source) throw new ServiceMutationError("Data source not found", 404);
          sourceVersions[id] = source.version;
          const links = await tx
            .select({ databaseId: databaseDataSource.databaseId })
            .from(databaseDataSource)
            .where(eq(databaseDataSource.dataSourceId, id));
          for (const { databaseId } of links) {
            const mutation = dispatched.mutations.find((item) => item.databaseId === databaseId);
            if (mutation) {
              mutation.requiresReset = true;
              mutation.areas = [...new Set([...mutation.areas, "records" as const])];
            } else
              dispatched.mutations.push({
                databaseId,
                dataSourceId: null,
                areas: ["records"],
                changes: {},
                requiresReset: true,
              });
          }
        }
      }
      if (input.request.command.type === "database.favorite") {
        const [state] = await tx
          .insert(databaseActorState)
          .values({
            id: randomUUID(),
            databaseId: input.scope.databaseId,
            actorId: input.actorId,
            revision: 1,
          })
          .onConflictDoUpdate({
            target: [databaseActorState.databaseId, databaseActorState.actorId],
            set: { revision: sql`${databaseActorState.revision} + 1` },
          })
          .returning({ revision: databaseActorState.revision });
        if (!state) throw new Error("Missing actor confirmation");
        const acknowledgement = databaseCommandAckSchema.parse({
          commandId: input.request.commandId,
          event: null,
          sourceVersions: {},
          result: dispatched.result,
          privateConfirmation: { databaseId: input.scope.databaseId, revision: state.revision },
        }) as DatabaseCommandAck<TResult>;
        await tx.insert(databaseCommandReceipt).values({
          acknowledgement,
          actorId: input.actorId,
          commandId: input.request.commandId,
          createdAt: now,
          databaseId: input.scope.databaseId,
          dataSourceId: null,
          eventId: null,
          expiresAt: new Date(now.getTime() + COMMAND_RECEIPT_RETENTION_MS),
          requestHash,
        });
        return { acknowledgement, eventIds: [] as string[] };
      }
      agentTriggerFacts = dispatched.automationFacts ?? [];
      if (agentTriggerFacts.length) {
        await captureDatabaseAutomationMutationFacts(
          tx,
          agentTriggerFacts,
          input.env ? { capturedWindows: automationWindows } : {},
        );
      }

      if (
        dispatched.mutations.length === 0 ||
        !dispatched.mutations.some(({ databaseId }) => databaseId === input.scope.databaseId)
      ) {
        throw new Error("Database command did not produce a host mutation event");
      }

      const duplicateHost = dispatched.mutations.find(
        (mutation, index, mutations) =>
          mutations.findIndex(({ databaseId }) => databaseId === mutation.databaseId) !== index,
      );
      if (duplicateHost) {
        throw new Error("Database command produced multiple events for one host");
      }

      const events: DatabaseMutationEventV2[] = [];
      for (const mutation of [...dispatched.mutations].sort((left, right) =>
        left.databaseId.localeCompare(right.databaseId),
      )) {
        const version =
          mutation.databaseId === input.scope.databaseId && primaryHostVersion !== null
            ? primaryHostVersion
            : (
                await tx
                  .update(database)
                  .set({ version: sql`${database.version} + 1` })
                  .where(eq(database.id, mutation.databaseId))
                  .returning({ version: database.version })
              )[0]?.version;
        if (version === undefined) throw new ServiceMutationError("Database not found", 404);

        const prepared = boundedChanges(mutation);
        const changes = prepared.changes.databases
          ? {
              ...prepared.changes,
              databases: prepared.changes.databases.map((host) =>
                host.id === mutation.databaseId ? { ...host, version } : host,
              ),
            }
          : prepared.changes;
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
        });
      }

      await tx.insert(databaseMutationEvent).values(events.map(storedEvent));
      await tx.insert(databaseRealtimeOutbox).values(
        events.map((event) => ({
          eventId: event.eventId,
          id: event.eventId,
        })),
      );
      const primaryEvent = events.find(({ databaseId }) => databaseId === input.scope.databaseId)!;
      const acknowledgement = databaseCommandAckSchema.parse({
        commandId: input.request.commandId,
        event: primaryEvent,
        result: dispatched.result,
        sourceVersions,
      }) as DatabaseCommandAck<TResult>;

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
      });

      return { acknowledgement, eventIds: events.map(({ eventId }) => eventId) };
    }),
  );

  if (input.env && committed.eventIds.length > 0) {
    await measureDatabaseOperation("enqueue_duration_ms", metricAttributes, () =>
      dispatchBackgroundTasks(input.env!, [
        ...committed.eventIds.map((eventId) =>
          createBackgroundTask({
            env: input.env!,
            kind: "realtime.database",
            resourceId: eventId,
          }),
        ),
        ...automationWindows.map((window) =>
          createBackgroundTask({
            availableAt: window.availableAt,
            env: input.env!,
            kind: "automation.event_window",
            resourceId: window.id,
          }),
        ),
      ]),
    ).catch((error) => {
      // The durable outbox remains retryable; delivery cannot reject a committed receipt.
      console.error("Database command delivery deferred", error);
    });
    if (agentTriggerFacts.length) {
      try {
        const { dispatchDatabaseAgentMutationFacts } =
          await import("../../ai/agents/agent-trigger-service");
        await dispatchDatabaseAgentMutationFacts(input.env, {
          eventKeyPrefix: `database-command:${input.request.commandId}`,
          facts: agentTriggerFacts,
        });
      } catch (error) {
        console.error(
          JSON.stringify({
            error: error instanceof Error ? error.name : "UnknownError",
            event: "custom_agent_database_trigger_dispatch_failed",
          }),
        );
      }
    }
  }
  for (const deliver of deliveries) {
    try {
      await deliver();
    } catch (error) {
      console.error(
        "Database committed delivery failed",
        error instanceof Error ? error.name : "UnknownError",
      );
    }
  }
  return committed.acknowledgement;
}
