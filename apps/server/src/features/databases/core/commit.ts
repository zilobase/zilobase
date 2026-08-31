import { eq, sql, type SQL } from "drizzle-orm";

import type { RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import type { Database } from "../../../infrastructure/database";
import {
  dataSource,
  database,
  databaseDataSource,
  databaseRealtimeOutbox,
} from "../../../infrastructure/database/schema";
import {
  type DatabaseChangedArea,
  type DatabaseDelta,
  type DatabaseMutationResponse,
  prepareDatabaseRealtimeDelta,
  toMutationResponse,
} from "../realtime/delta";
import { publishDatabaseRealtimeEvent } from "../realtime/outbox";
import {
  enqueueNavigationInvalidation,
  publishCommittedNavigationInvalidation,
} from "../../workspaces/navigation-realtime/outbox";

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

type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type CommitOptions = {
  actorId: string;
  changed: DatabaseChangedArea[];
  databaseId: string;
  env?: RuntimeEnv;
  navigationWorkspaceId?: string;
};

type BatchMutation = {
  changed: DatabaseChangedArea[];
  databaseId: string;
  delta: DatabaseDelta;
};

type DataSourceBatchMutation = {
  changed: DatabaseChangedArea[];
  dataSourceId: string;
  delta: DatabaseDelta;
};

type BatchCommitOptions = {
  actorId: string;
  env?: RuntimeEnv;
  navigationWorkspaceId?: string;
};

type CommitMetadata = {
  actorId: string;
  changed: DatabaseChangedArea[];
  committedAt: string;
  databaseId: string;
  mutationId: string;
  requiresRefetch?: true;
  version: number;
};

export type DatabaseMutationCommitResult = CommitMetadata & {
  delta: DatabaseDelta;
};

type DatabaseMutationBatchResult<T> = {
  commits: DatabaseMutationCommitResult[];
  result: T;
};

const publishCommits = async (
  commits: DatabaseMutationCommitResult[],
  env?: RuntimeEnv,
) => {
  if (!env) {
    return;
  }

  await Promise.all(
    commits.map(async (commit) => {
      try {
        await publishDatabaseRealtimeEvent(
          {
            ...toMutationResponse(commit, commit.delta),
            actorId: commit.actorId,
            protocolVersion: 1,
            type: "database.mutation",
          },
          env,
        );
      } catch (error) {
        console.error(
          JSON.stringify({
            databaseId: commit.databaseId,
            error: error instanceof Error ? error.message : String(error),
            event: "database_realtime_immediate_publish_failed",
            mutationId: commit.mutationId,
            version: commit.version,
          }),
        );
      }
    }),
  );
};

export async function commitDatabaseMutationBatch<T>(
  options: BatchCommitOptions,
  mutate: (
    tx: DatabaseTransaction,
  ) => Promise<{ mutations: BatchMutation[]; result: T }>,
): Promise<DatabaseMutationBatchResult<T>> {
  const committedAt = new Date().toISOString();
  const { commits, navigationEvent, result } = await db.transaction(async (tx) => {
    const mutationResult = await mutate(tx);
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
      const mutationId = crypto.randomUUID();
      const delta = prepareDatabaseRealtimeDelta(mutation.delta);

      outboxRows.push({
        actorId: options.actorId,
        changed: mutation.changed,
        committedAt: new Date(committedAt),
        databaseId: mutation.databaseId,
        delta: delta.value,
        id: mutationId,
        requiresRefetch: delta.requiresRefetch,
        version,
      });

      commits.push({
        actorId: options.actorId,
        changed: mutation.changed,
        committedAt,
        databaseId: mutation.databaseId,
        delta: delta.value,
        mutationId,
        ...(delta.requiresRefetch ? { requiresRefetch: true as const } : {}),
        version,
      });
    }

    if (outboxRows.length > 0) {
      await tx.insert(databaseRealtimeOutbox).values(outboxRows);
    }

    const navigationEvent = options.navigationWorkspaceId
      ? await enqueueNavigationInvalidation(tx, options.navigationWorkspaceId, {
          committedAt: new Date(committedAt),
        })
      : null;

    return { commits, navigationEvent, result: mutationResult.result };
  });

  await publishCommits(commits, options.env);
  if (navigationEvent) {
    await publishCommittedNavigationInvalidation(navigationEvent, options.env);
  }

  return { commits, result };
}

export async function commitDatabaseMutation(
  options: CommitOptions,
  mutate: (tx: DatabaseTransaction) => Promise<{ delta: DatabaseDelta }>,
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
        mutations: [
          {
            changed: options.changed,
            databaseId: options.databaseId,
            delta: result.delta,
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
 * delta out to every database container currently displaying that source.
 * Source versioning and all container outbox writes happen in one transaction.
 */
export async function commitDataSourceMutation(
  options: Omit<CommitOptions, "databaseId"> & { dataSourceId: string },
  mutate: (tx: DatabaseTransaction) => Promise<{ delta: DatabaseDelta }>,
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
        mutations: databaseIds.map((databaseId) => ({
          changed: options.changed,
          databaseId,
          delta: result.delta,
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
  options: Omit<CommitOptions, "databaseId" | "changed">,
  mutate: (
    tx: DatabaseTransaction,
  ) => Promise<{ mutations: DataSourceBatchMutation[]; result: T }>,
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
            changed: mutation.changed,
            databaseId,
            delta: mutation.delta,
          })),
        );
      }

      return {
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

export function mutationResponse(
  mutation: DatabaseMutationCommitResult,
): DatabaseMutationResponse {
  return toMutationResponse(
    {
      actorId: mutation.actorId,
      changed: mutation.changed,
      committedAt: mutation.committedAt,
      databaseId: mutation.databaseId,
      mutationId: mutation.mutationId,
      requiresRefetch: mutation.requiresRefetch,
      version: mutation.version,
    },
    mutation.delta,
  );
}
