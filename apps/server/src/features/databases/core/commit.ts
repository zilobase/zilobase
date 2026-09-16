import { eq, sql, type SQL } from "drizzle-orm";
import {
  databaseMutationChangesSchema,
  dataSourceMutationChangesV3Schema,
  type DatabaseChangedAreaV2,
  type DatabaseMutationChanges,
  type DatabaseMutationEventV2,
  type DataSourceChangedAreaV3,
  type DataSourceMutationChangesV3,
  type DataSourceMutationEventV3,
} from "@zilobase/features/databases/contracts";

import type { RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import type { Database } from "../../../infrastructure/database";
import {
  dataSource,
  database,
  databaseMutationEvent,
  databaseRealtimeOutbox,
} from "../../../infrastructure/database/schema";
import {
  enqueueNavigationInvalidation,
  publishCommittedNavigationInvalidation,
} from "../../workspaces/navigation-realtime/outbox";
import {
  captureDatabaseAutomationMutationFacts,
  type DatabaseAutomationMutationFactCandidate,
} from "../automations/triggers/event-capture";
import { createBackgroundTask } from "../../../infrastructure/background/contracts";
import { dispatchBackgroundTasks } from "../../../infrastructure/background/dispatch";
import { measureDatabaseOperation } from "../observability";

export class DatabaseMutationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "DatabaseMutationError";
  }
}

export type SqlExecutor = {
  execute: (query: SQL) => Promise<unknown>;
};

export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type CommitOptions = {
  actorId: string;
  areas: DatabaseChangedAreaV2[];
  databaseId: string;
  env?: RuntimeEnv;
  navigationWorkspaceId?: string;
};

type BatchMutation = {
  areas: DatabaseChangedAreaV2[];
  changes: DatabaseMutationChanges | ((databaseId: string) => Promise<DatabaseMutationChanges>);
  dataSourceId?: string | null;
  databaseId: string;
  requiresReset?: true;
};

type DataSourceBatchMutation = {
  areas: DatabaseChangedAreaV2[];
  changes: DatabaseMutationChanges | ((databaseId: string) => Promise<DatabaseMutationChanges>);
  dataSourceId: string;
  requiresReset?: true;
};

type BatchCommitOptions = {
  actorId: string;
  env?: RuntimeEnv;
  navigationWorkspaceId?: string;
};

export type DatabaseMutationCommitResult = DatabaseMutationEventV2;
export type DataSourceMutationCommitResult = DataSourceMutationEventV3;

type DatabaseMutationBatchResult<T> = {
  commits: DatabaseMutationCommitResult[];
  result: T;
};

function boundedChanges(changes: DatabaseMutationChanges, requiresReset?: true) {
  const parsed = databaseMutationChangesSchema.parse(changes);
  const size = new TextEncoder().encode(JSON.stringify(parsed)).byteLength;
  return size <= 64 * 1024
    ? { changes: parsed, requiresReset }
    : { changes: {}, requiresReset: true as const };
}

function sourceAreas(areas: DatabaseChangedAreaV2[]): DataSourceChangedAreaV3[] {
  return [...new Set(areas.map((area) => {
    if (area === "dataSources") return "source";
    if (area === "properties" || area === "records") return area;
    throw new DatabaseMutationError(
      `Host-only area cannot be committed to a source stream: ${area}`,
    );
  }))];
}

function sourceChanges(
  input: DatabaseMutationChanges,
  sourceId: string,
  sourceVersion: number,
): DataSourceMutationChangesV3 {
  const changes = databaseMutationChangesSchema.parse(input);
  if (
    changes.databases ||
    changes.views ||
    changes.removedDatabaseIds ||
    changes.removedViewIds ||
    changes.removedDataSourceIds
  ) {
    throw new DatabaseMutationError(
      "Host-only changes cannot be committed to a source stream",
    );
  }

  const changedSource = changes.dataSources?.find(({ id }) => id === sourceId);
  if (changes.dataSources?.length && !changedSource) {
    throw new DatabaseMutationError(
      "Source metadata changes do not match the source stream",
    );
  }

  return dataSourceMutationChangesV3Schema.parse({
    ...(changedSource
      ? {
          source: {
            config: changedSource.config,
            configVersion: changedSource.configVersion,
            createdAt: changedSource.createdAt,
            id: changedSource.id,
            name: changedSource.name,
            parentDatabaseId: changedSource.parentDatabaseId,
            updatedAt: changedSource.updatedAt,
            version: sourceVersion,
            workspaceId: changedSource.workspaceId,
          },
        }
      : {}),
    ...(changes.properties ? { properties: changes.properties } : {}),
    ...(changes.records ? { records: changes.records } : {}),
    ...(changes.removedPropertyIds
      ? { removedPropertyIds: changes.removedPropertyIds }
      : {}),
    ...(changes.removedRecordIds
      ? { removedRecordIds: changes.removedRecordIds }
      : {}),
  });
}

function boundedSourceChanges(
  changes: DataSourceMutationChangesV3,
  requiresReset?: true,
) {
  const parsed = dataSourceMutationChangesV3Schema.parse(changes);
  const size = new TextEncoder().encode(JSON.stringify(parsed)).byteLength;
  return size <= 64 * 1024
    ? { changes: parsed, requiresReset }
    : { changes: {}, requiresReset: true as const };
}

export function prepareDataSourceMutation(
  areas: DatabaseChangedAreaV2[],
  changes: DatabaseMutationChanges,
  sourceId: string,
  sourceVersion: number,
  requiresReset?: true,
) {
  const prepared = boundedSourceChanges(
    sourceChanges(changes, sourceId, sourceVersion),
    requiresReset,
  );
  return {
    areas: sourceAreas(areas),
    changes: prepared.changes,
    ...(prepared.requiresReset ? { requiresReset: true as const } : {}),
  };
}

export async function commitDatabaseMutationBatch<T>(
  options: BatchCommitOptions,
  mutate: (
    tx: DatabaseTransaction,
  ) => Promise<{
    automationFacts?: DatabaseAutomationMutationFactCandidate[];
    mutations: BatchMutation[];
    result: T;
  }>,
): Promise<DatabaseMutationBatchResult<T>> {
  const committedAt = new Date().toISOString();
  const automationWindows: Array<{ availableAt: Date; id: string }> = [];
  let agentTriggerFacts: DatabaseAutomationMutationFactCandidate[] = [];
  const { commits, navigationEvent, result } = await measureDatabaseOperation(
    "commit_duration_ms",
    { operation: "internal", scope: "source" },
    () => db.transaction(async (tx) => {
    const mutationResult = await mutate(tx);
    agentTriggerFacts = mutationResult.automationFacts ?? [];
    if (mutationResult.automationFacts?.length) {
      if (options.env) {
        await captureDatabaseAutomationMutationFacts(
          tx,
          mutationResult.automationFacts,
          { capturedWindows: automationWindows },
        );
      } else {
        await captureDatabaseAutomationMutationFacts(tx, mutationResult.automationFacts);
      }
    }
    const mutationCountsByDatabase = new Map<string, number>();

    for (const mutation of mutationResult.mutations) {
      mutationCountsByDatabase.set(
        mutation.databaseId,
        (mutationCountsByDatabase.get(mutation.databaseId) ?? 0) + 1,
      );
    }

    const nextVersionByDatabase = new Map<string, number>();
    const versionReservations = [...mutationCountsByDatabase].sort(
      ([firstDatabaseId], [secondDatabaseId]) =>
        firstDatabaseId.localeCompare(secondDatabaseId),
    );

    for (const [databaseId, mutationCount] of versionReservations) {
      const [versioned] = await tx
        .update(database)
        .set({ version: sql`${database.version} + ${mutationCount}` })
        .where(eq(database.id, databaseId))
        .returning({ version: database.version });

      if (!versioned) {
        throw new DatabaseMutationError("Database not found", 404);
      }

      nextVersionByDatabase.set(databaseId, versioned.version - mutationCount);
    }

    const commits: DatabaseMutationCommitResult[] = [];
    const outboxRows: Array<typeof databaseRealtimeOutbox.$inferInsert> = [];

    for (const mutation of mutationResult.mutations) {
      const previousVersion = nextVersionByDatabase.get(mutation.databaseId);

      if (previousVersion === undefined) {
        throw new Error("Database mutation version was not allocated");
      }

      const version = previousVersion + 1;
      nextVersionByDatabase.set(mutation.databaseId, version);
      const eventId = crypto.randomUUID();
      const resolvedChanges = typeof mutation.changes === "function"
        ? await mutation.changes(mutation.databaseId)
        : mutation.changes;
      const prepared = boundedChanges(resolvedChanges, mutation.requiresReset);
      const event: DatabaseMutationEventV2 = {
        actorId: options.actorId,
        areas: mutation.areas,
        changes: prepared.changes,
        commandId: commits[0]?.commandId ?? eventId,
        committedAt,
        databaseId: mutation.databaseId,
        dataSourceId: mutation.dataSourceId ?? null,
        eventId,
        protocolVersion: 2,
        ...(prepared.requiresReset ? { requiresReset: true as const } : {}),
        type: "database.mutation",
        version,
      };

      outboxRows.push({
        id: eventId,
        eventId,
      });

      commits.push(event);
    }

    if (outboxRows.length > 0) {
      const commandId = commits[0]!.commandId;
      await tx.insert(databaseMutationEvent).values(commits.map((event) => ({
        actorId: event.actorId,
        areas: event.areas,
        changes: event.changes,
        commandId,
        committedAt: new Date(event.committedAt),
        databaseId: event.databaseId,
        dataSourceId: event.dataSourceId,
        id: event.eventId,
        protocolVersion: event.protocolVersion,
        requiresReset: event.requiresReset === true,
        sourceId: null,
        streamKind: "host",
        version: event.version,
      })));
      await tx.insert(databaseRealtimeOutbox).values(outboxRows);
    }

    const navigationEvent = options.navigationWorkspaceId
      ? await enqueueNavigationInvalidation(tx, options.navigationWorkspaceId, {
          committedAt: new Date(committedAt),
        })
      : null;

    return { commits, navigationEvent, result: mutationResult.result };
    }),
  );

  if (options.env) {
    await measureDatabaseOperation(
      "enqueue_duration_ms",
      { operation: "internal", scope: "source" },
      () => dispatchBackgroundTasks(options.env!, [
        ...commits.map((commit) => createBackgroundTask({
          env: options.env!,
          kind: "realtime.database" as const,
          resourceId: commit.eventId,
        })),
        ...automationWindows.map((window) => createBackgroundTask({
          availableAt: window.availableAt,
          env: options.env!,
          kind: "automation.event_window" as const,
          resourceId: window.id,
        })),
      ]),
    );
    if (agentTriggerFacts.length > 0 && commits.length > 0) {
      try {
        const { dispatchDatabaseAgentMutationFacts } = await import("../../ai/agents/agent-trigger-service");
        await dispatchDatabaseAgentMutationFacts(options.env, {
          eventKeyPrefix: `database-mutation:${commits.map((commit) => commit.eventId).join(":")}`,
          facts: agentTriggerFacts,
        });
      } catch (error) {
        console.error(JSON.stringify({
          error: error instanceof Error ? error.name : "UnknownError",
          event: "custom_agent_database_trigger_dispatch_failed",
        }));
      }
    }
  }

  if (navigationEvent) {
    await publishCommittedNavigationInvalidation(navigationEvent, options.env);
  }

  return { commits, result };
}

export async function commitDatabaseMutation(
  options: CommitOptions,
  mutate: (tx: DatabaseTransaction) => Promise<{
    automationFacts?: DatabaseAutomationMutationFactCandidate[];
    changes: DatabaseMutationChanges | ((databaseId: string) => Promise<DatabaseMutationChanges>);
    requiresReset?: true;
  }>,
): Promise<DatabaseMutationCommitResult> {
  const { commits } = await commitDatabaseMutationBatch(
    {
      actorId: options.actorId,
      env: options.env,
      navigationWorkspaceId: options.navigationWorkspaceId,
    },
    async (tx) => {
      const result = await mutate(tx);
      return {
        automationFacts: result.automationFacts,
        mutations: [
          {
            areas: options.areas,
            changes: result.changes,
            databaseId: options.databaseId,
            requiresReset: result.requiresReset,
          },
        ],
        result: undefined,
      };
    },
  );

  const committed = commits[0];

  if (!committed) {
    throw new Error("Database mutation did not produce a commit");
  }

  return committed;
}

/** Commits one durable mutation to the source stream. */
export async function commitDataSourceMutation(
  options: Omit<CommitOptions, "databaseId"> & { dataSourceId: string },
  mutate: (tx: DatabaseTransaction) => Promise<{
    automationFacts?: DatabaseAutomationMutationFactCandidate[];
    changes: DatabaseMutationChanges | ((databaseId: string) => Promise<DatabaseMutationChanges>);
    requiresReset?: true;
  }>,
): Promise<DataSourceMutationCommitResult> {
  const { commits } = await commitDataSourceMutationBatch(
    { actorId: options.actorId, env: options.env },
    async (tx) => {
      const result = await mutate(tx);
      return {
        automationFacts: result.automationFacts,
        mutations: [{
          areas: options.areas,
          changes: result.changes,
          dataSourceId: options.dataSourceId,
          requiresReset: result.requiresReset,
        }],
        result: undefined,
      };
    },
  );

  const committed = commits[0];
  if (!committed) {
    throw new Error("Data source mutation did not produce a commit");
  }
  return committed;
}

/**
 * Atomic multi-source variant used by operations such as moving a row from
 * one source to another. Each logical mutation gets one source version and
 * one durable realtime event, independent of how many hosts link the source.
 */
export async function commitDataSourceMutationBatch<T>(
  options: Omit<CommitOptions, "databaseId" | "areas">,
  mutate: (
    tx: DatabaseTransaction,
  ) => Promise<{
    automationFacts?: DatabaseAutomationMutationFactCandidate[];
    mutations: DataSourceBatchMutation[];
    result: T;
  }>,
) {
  const committedAt = new Date().toISOString();
  const automationWindows: Array<{ availableAt: Date; id: string }> = [];
  let agentTriggerFacts: DatabaseAutomationMutationFactCandidate[] = [];
  const batch = await measureDatabaseOperation(
    "commit_duration_ms",
    { operation: "internal", scope: "source" },
    () => db.transaction(async (tx) => {
      const mutationResult = await mutate(tx);
      agentTriggerFacts = mutationResult.automationFacts ?? [];
      if (mutationResult.automationFacts?.length) {
        await captureDatabaseAutomationMutationFacts(
          tx,
          mutationResult.automationFacts,
          options.env ? { capturedWindows: automationWindows } : {},
        );
      }

      const mutationCountsBySource = new Map<string, number>();
      for (const mutation of mutationResult.mutations) {
        mutationCountsBySource.set(
          mutation.dataSourceId,
          (mutationCountsBySource.get(mutation.dataSourceId) ?? 0) + 1,
        );
      }

      const nextVersionBySource = new Map<string, number>();
      const parentBySource = new Map<string, string>();
      for (const [sourceId, mutationCount] of [...mutationCountsBySource].sort(
        ([left], [right]) => left.localeCompare(right),
      )) {
        const [versioned] = await tx
          .update(dataSource)
          .set({
            updatedAt: new Date(),
            version: sql`${dataSource.version} + ${mutationCount}`,
          })
          .where(eq(dataSource.id, sourceId))
          .returning({
            parentDatabaseId: dataSource.parentDatabaseId,
            version: dataSource.version,
          });

        if (!versioned) {
          throw new DatabaseMutationError("Data source not found", 404);
        }
        nextVersionBySource.set(sourceId, versioned.version - mutationCount);
        parentBySource.set(sourceId, versioned.parentDatabaseId);
      }

      const commits: DataSourceMutationCommitResult[] = [];
      for (const mutation of mutationResult.mutations) {
        const previousVersion = nextVersionBySource.get(mutation.dataSourceId);
        const parentDatabaseId = parentBySource.get(mutation.dataSourceId);
        if (previousVersion === undefined || !parentDatabaseId) {
          throw new Error("Data source mutation version was not allocated");
        }
        const sourceVersion = previousVersion + 1;
        nextVersionBySource.set(mutation.dataSourceId, sourceVersion);
        const resolvedChanges = typeof mutation.changes === "function"
          ? await mutation.changes(parentDatabaseId)
          : mutation.changes;
        const prepared = prepareDataSourceMutation(
          mutation.areas,
          resolvedChanges,
          mutation.dataSourceId,
          sourceVersion,
          mutation.requiresReset,
        );
        const eventId = crypto.randomUUID();
        commits.push({
          actorId: options.actorId,
          areas: prepared.areas,
          changes: prepared.changes,
          commandId: commits[0]?.commandId ?? eventId,
          committedAt,
          eventId,
          protocolVersion: 3,
          ...(prepared.requiresReset ? { requiresReset: true as const } : {}),
          sourceId: mutation.dataSourceId,
          sourceVersion,
          type: "database.mutation",
        });
      }

      if (commits.length > 0) {
        await tx.insert(databaseMutationEvent).values(commits.map((event) => ({
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
        })));
        await tx.insert(databaseRealtimeOutbox).values(commits.map((event) => ({
          eventId: event.eventId,
          id: event.eventId,
        })));
      }

      return { commits, result: mutationResult.result };
    }),
  );

  if (options.env) {
    await measureDatabaseOperation(
      "enqueue_duration_ms",
      { operation: "internal", scope: "source" },
      () => dispatchBackgroundTasks(options.env!, [
        ...batch.commits.map((commit) => createBackgroundTask({
          env: options.env!,
          kind: "realtime.database" as const,
          resourceId: commit.eventId,
        })),
        ...automationWindows.map((window) => createBackgroundTask({
          availableAt: window.availableAt,
          env: options.env!,
          kind: "automation.event_window" as const,
          resourceId: window.id,
        })),
      ]),
    );
    if (agentTriggerFacts.length > 0 && batch.commits.length > 0) {
      try {
        const { dispatchDatabaseAgentMutationFacts } = await import(
          "../../ai/agents/agent-trigger-service"
        );
        await dispatchDatabaseAgentMutationFacts(options.env, {
          eventKeyPrefix: `database-mutation:${batch.commits.map((commit) => commit.eventId).join(":")}`,
          facts: agentTriggerFacts,
        });
      } catch (error) {
        console.error(JSON.stringify({
          error: error instanceof Error ? error.name : "UnknownError",
          event: "custom_agent_database_trigger_dispatch_failed",
        }));
      }
    }
  }

  return {
    commits: batch.commits,
    result: batch.result,
  };
}
