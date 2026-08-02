import { eq, sql, type SQL } from "drizzle-orm";

import type { RuntimeEnv } from "../config";
import { db } from "../db";
import type { Database } from "../db";
import { database, databaseRealtimeOutbox } from "../db/schema";
import {
  type DatabaseChangedArea,
  type DatabaseDelta,
  type DatabaseMutationResponse,
  prepareDatabaseRealtimeDelta,
  toMutationResponse,
} from "./database-delta";
import { publishDatabaseRealtimeEvent } from "./database-realtime";

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
};

type BatchMutation = {
  changed: DatabaseChangedArea[];
  databaseId: string;
  delta: DatabaseDelta;
};

type BatchCommitOptions = {
  actorId: string;
  env?: RuntimeEnv;
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
  const { commits, result } = await db.transaction(async (tx) => {
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

    return { commits, result: mutationResult.result };
  });

  await publishCommits(commits, options.env);

  return { commits, result };
}

export async function commitDatabaseMutation(
  options: CommitOptions,
  mutate: (tx: DatabaseTransaction) => Promise<{ delta: DatabaseDelta }>,
): Promise<DatabaseMutationCommitResult> {
  const { commits } = await commitDatabaseMutationBatch(
    options,
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
