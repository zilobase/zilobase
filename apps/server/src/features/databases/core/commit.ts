import { eq, sql, type SQL } from "drizzle-orm";
import {
  databaseMutationChangesSchema,
  type DatabaseChangedAreaV2,
  type DatabaseMutationChanges,
  type DatabaseMutationEventV2,
} from "@zilobase/features/databases/contracts";

import type { RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import type { Database } from "../../../infrastructure/database";
import {
  dataSource,
  database,
  databaseDataSource,
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

/**
 * Commits schema/row mutations against a data source, then fans the same
 * changeset out to every database container currently displaying that source.
 * Source versioning and all container outbox writes happen in one transaction.
 */
export async function commitDataSourceMutation(
  options: Omit<CommitOptions, "databaseId"> & { dataSourceId: string },
  mutate: (tx: DatabaseTransaction) => Promise<{
    automationFacts?: DatabaseAutomationMutationFactCandidate[];
    changes: DatabaseMutationChanges | ((databaseId: string) => Promise<DatabaseMutationChanges>);
    requiresReset?: true;
  }>,
): Promise<DatabaseMutationCommitResult> {
  const { commits, result: metadata } = await commitDatabaseMutationBatch(
    { actorId: options.actorId, env: options.env },
    async (tx) => {
      const result = await mutate(tx);
      const [versioned] = await tx
        .update(dataSource)
        .set({
          updatedAt: new Date(),
          version: sql`${dataSource.version} + 1`,
        })
        .where(eq(dataSource.id, options.dataSourceId))
        .returning({
          parentDatabaseId: dataSource.parentDatabaseId,
          version: dataSource.version,
        });

      if (!versioned) {
        throw new DatabaseMutationError("Data source not found", 404);
      }

      const links = await tx
        .select({ databaseId: databaseDataSource.databaseId })
        .from(databaseDataSource)
        .where(eq(databaseDataSource.dataSourceId, options.dataSourceId));
      const databaseIds = [
        ...new Set([
          versioned.parentDatabaseId,
          ...links.map((link) => link.databaseId),
        ]),
      ];

      return {
        automationFacts: result.automationFacts,
        mutations: databaseIds.map((databaseId) => ({
          areas: options.areas,
          changes: result.changes,
          dataSourceId: options.dataSourceId,
          databaseId,
          requiresReset: result.requiresReset,
        })),
        result: { parentDatabaseId: versioned.parentDatabaseId },
      };
    },
  );

  const ownerCommit = commits.find(
    (commit) => commit.databaseId === metadata.parentDatabaseId,
  );
  if (!ownerCommit) {
    throw new Error("Data source mutation did not produce a commit");
  }

  return ownerCommit;
}

/**
 * Atomic multi-source variant used by operations such as moving a row from
 * one source to another. Each source gets its own version, and every attached
 * database container receives an ordered durable realtime mutation.
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
  const batch = await commitDatabaseMutationBatch(
    { actorId: options.actorId, env: options.env },
    async (tx) => {
      const mutationResult = await mutate(tx);
      const owners: Array<{ containerCount: number; ownerDatabaseId: string }> = [];
      const containerMutations: BatchMutation[] = [];

      for (const mutation of mutationResult.mutations) {
        const [versioned] = await tx
          .update(dataSource)
          .set({
            updatedAt: new Date(),
            version: sql`${dataSource.version} + 1`,
          })
          .where(eq(dataSource.id, mutation.dataSourceId))
          .returning({ parentDatabaseId: dataSource.parentDatabaseId });

        if (!versioned) {
          throw new DatabaseMutationError("Data source not found", 404);
        }

        const links = await tx
          .select({ databaseId: databaseDataSource.databaseId })
          .from(databaseDataSource)
          .where(eq(databaseDataSource.dataSourceId, mutation.dataSourceId));
        const databaseIds = [
          ...new Set([
            versioned.parentDatabaseId,
            ...links.map((link) => link.databaseId),
          ]),
        ];

        owners.push({
          containerCount: databaseIds.length,
          ownerDatabaseId: versioned.parentDatabaseId,
        });
        containerMutations.push(
          ...databaseIds.map((databaseId) => ({
            areas: mutation.areas,
            changes: mutation.changes,
            dataSourceId: mutation.dataSourceId,
            databaseId,
            requiresReset: mutation.requiresReset,
          })),
        );
      }

      return {
        automationFacts: mutationResult.automationFacts,
        mutations: containerMutations,
        result: { owners, result: mutationResult.result },
      };
    },
  );

  let offset = 0;
  const commits = batch.result.owners.map((owner) => {
    const sourceCommits = batch.commits.slice(
      offset,
      offset + owner.containerCount,
    );
    offset += owner.containerCount;
    const ownerCommit = sourceCommits.find(
      (commit) => commit.databaseId === owner.ownerDatabaseId,
    );
    if (!ownerCommit) {
      throw new Error("Data source mutation did not produce an owner commit");
    }
    return ownerCommit;
  });

  return {
    commits,
    containerCommits: batch.commits,
    result: batch.result.result,
  };
}
