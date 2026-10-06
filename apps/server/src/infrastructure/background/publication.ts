import { AsyncLocalStorage } from "node:async_hooks";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db, runWithDb, type Database } from "../database";
import { backgroundDispatch } from "../database/schema";
import { requireRuntimePort } from "@zilobase/runtime-adapter/capabilities";
import { getBackgroundCellId } from "./contracts";
import {
  BACKGROUND_PUBLICATION_HORIZON_MS,
  decodeBackgroundTaskV2,
  type BackgroundTaskV2,
} from "./task-v2";

const transactionStore = new AsyncLocalStorage<boolean>();
export const inBackgroundTransaction = () => transactionStore.getStore() === true;

export async function backgroundTransaction<T>(
  env: Record<string, unknown>,
  work: (tx: Parameters<Parameters<Database["transaction"]>[0]>[0]) => Promise<T>,
): Promise<T> {
  if (inBackgroundTransaction())
    return work(db as Parameters<Parameters<Database["transaction"]>[0]>[0]);
  const result = await db.transaction((tx) =>
    runWithDb(tx as unknown as Database, () => transactionStore.run(true, () => work(tx))),
  );
  await publishBackgroundDispatches(env).catch(() => undefined);
  return result;
}

export async function persistBackgroundTasks(
  env: Record<string, unknown>,
  tasks: readonly BackgroundTaskV2[],
  executor: Pick<Database, "insert"> = db,
  occurrenceKey?: string,
) {
  for (const raw of tasks) {
    const task = decodeBackgroundTaskV2(raw, getBackgroundCellId(env));
    const immutable = task.kind === "realtime.database" || task.kind === "notification.publish";
    const logicalKey =
      occurrenceKey ??
      JSON.stringify([task.kind, task.resourceId, immutable ? "initial" : task.availableAt]);
    await executor
      .insert(backgroundDispatch)
      .values({
        id: task.taskId,
        cellId: task.cellId,
        logicalKey,
        kind: task.kind,
        resourceId: task.resourceId,
        task,
        availableAt: new Date(task.availableAt),
        nextPublicationAt: new Date(),
      })
      .onConflictDoNothing();
  }
}

export async function publishBackgroundDispatches(env: Record<string, unknown>, limit = 100) {
  const cellId = getBackgroundCellId(env);
  const owner = crypto.randomUUID();
  const now = new Date();
  const rows = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(backgroundDispatch)
      .where(
        and(
          eq(backgroundDispatch.cellId, cellId),
          inArray(backgroundDispatch.status, ["pending", "published", "running"]),
          lte(
            backgroundDispatch.availableAt,
            new Date(now.getTime() + BACKGROUND_PUBLICATION_HORIZON_MS),
          ),
          lte(backgroundDispatch.nextPublicationAt, now),
          or(
            isNull(backgroundDispatch.leaseExpiresAt),
            lte(backgroundDispatch.leaseExpiresAt, now),
          ),
        ),
      )
      .orderBy(asc(backgroundDispatch.nextPublicationAt))
      .limit(Math.min(Math.max(limit, 1), 500))
      .for("update", { skipLocked: true });
    for (const row of rows)
      await tx
        .update(backgroundDispatch)
        .set({
          status: "pending",
          leaseOwner: owner,
          leaseExpiresAt: new Date(now.getTime() + 30_000),
          updatedAt: now,
        })
        .where(eq(backgroundDispatch.id, row.id));
    return rows;
  });
  let published = 0;
  await Promise.all(
    rows.map(async (row) => {
      const claim = and(
        eq(backgroundDispatch.id, row.id),
        eq(backgroundDispatch.cellId, cellId),
        eq(backgroundDispatch.leaseOwner, owner),
      );
      try {
        await requireRuntimePort("jobs").dispatch([row.task]);
        await db
          .update(backgroundDispatch)
          .set({
            status: "published",
            publishedAt: new Date(),
            nextPublicationAt: new Date(Date.now() + 300_000),
            leaseOwner: null,
            leaseExpiresAt: null,
            errorCode: null,
            updatedAt: new Date(),
          })
          .where(claim);
        published++;
      } catch (error) {
        await db
          .update(backgroundDispatch)
          .set({
            status: "pending",
            nextPublicationAt: new Date(Date.now() + 5_000),
            leaseOwner: null,
            leaseExpiresAt: null,
            errorCode: error instanceof Error ? error.name.slice(0, 100) : "DISPATCH_FAILED",
            updatedAt: new Date(),
          })
          .where(claim);
        console.warn(
          JSON.stringify({ event: "background.dispatch_deferred", taskId: row.id, kind: row.kind }),
        );
      }
    }),
  );
  return { published, claimed: rows.length };
}

export function createBackgroundDeliveryStore(env: Record<string, unknown>, workerId: string) {
  const scope = (task: BackgroundTaskV2) =>
    and(
      eq(backgroundDispatch.id, task.taskId),
      eq(backgroundDispatch.cellId, getBackgroundCellId(env)),
    );
  const owned = (task: BackgroundTaskV2) =>
    and(
      scope(task),
      eq(backgroundDispatch.leaseOwner, workerId),
      inArray(backgroundDispatch.status, ["running", "exhausted"]),
    );
  return {
    async load(task: BackgroundTaskV2): Promise<"ready" | "done" | { availableAt: string }> {
      const [persisted] = await db.select().from(backgroundDispatch).where(scope(task)).limit(1);
      if (!persisted) throw new Error("BACKGROUND_TASK_NOT_ADMITTED");
      if (
        Object.entries(task).some(
          ([key, value]) => value !== persisted.task[key as keyof BackgroundTaskV2],
        )
      )
        throw new Error("BACKGROUND_TASK_PERSISTED_MISMATCH");
      const [row] = await db
        .update(backgroundDispatch)
        .set({
          status: "running",
          leaseOwner: workerId,
          leaseExpiresAt: new Date(Date.now() + 90_000),
          updatedAt: new Date(),
        })
        .where(
          and(
            scope(task),
            or(
              inArray(backgroundDispatch.status, ["pending", "published"]),
              and(
                eq(backgroundDispatch.status, "running"),
                or(
                  isNull(backgroundDispatch.leaseExpiresAt),
                  lte(backgroundDispatch.leaseExpiresAt, sql`current_timestamp`),
                ),
              ),
            ),
          ),
        )
        .returning();
      if (!row) {
        if (persisted.status === "running" && persisted.leaseExpiresAt)
          return { availableAt: persisted.leaseExpiresAt.toISOString() };
        return "done";
      }
      return "ready";
    },
    async renew(task: BackgroundTaskV2) {
      const rows = await db
        .update(backgroundDispatch)
        .set({ leaseExpiresAt: new Date(Date.now() + 90_000) })
        .where(owned(task))
        .returning({ id: backgroundDispatch.id });
      if (!rows.length) throw new Error("BACKGROUND_DELIVERY_LEASE_LOST");
    },
    async release(task: BackgroundTaskV2) {
      await db
        .update(backgroundDispatch)
        .set({ status: "published", leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date() })
        .where(and(owned(task), eq(backgroundDispatch.status, "running")));
      await db
        .update(backgroundDispatch)
        .set({ leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date() })
        .where(and(owned(task), eq(backgroundDispatch.status, "exhausted")));
    },
    async complete(task: BackgroundTaskV2, result: { outcome: string; errorCode?: string }) {
      const rows = await db
        .update(backgroundDispatch)
        .set({
          status: result.outcome === "terminal" ? "terminal" : "completed",
          errorCode: result.errorCode ?? null,
          completedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(owned(task))
        .returning({ id: backgroundDispatch.id });
      if (!rows.length) throw new Error("BACKGROUND_DELIVERY_LEASE_LOST");
    },
    async reschedule(task: BackgroundTaskV2, availableAt: string) {
      await backgroundTransaction(env, async (tx) => {
        const [current] = await tx
          .select()
          .from(backgroundDispatch)
          .where(owned(task))
          .for("update");
        if (current?.status === "exhausted") {
          await tx
            .update(backgroundDispatch)
            .set({ leaseOwner: null, leaseExpiresAt: null })
            .where(owned(task));
          return;
        }
        const next = { ...task, taskId: crypto.randomUUID(), availableAt };
        await persistBackgroundTasks(
          env,
          [next],
          tx,
          task.kind === "realtime.database" || task.kind === "notification.publish"
            ? JSON.stringify([task.kind, task.resourceId, availableAt])
            : undefined,
        );
        const rows = await tx
          .update(backgroundDispatch)
          .set({
            status: "completed",
            completedAt: new Date(),
            leaseOwner: null,
            leaseExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(owned(task))
          .returning({ id: backgroundDispatch.id });
        if (!rows.length) throw new Error("BACKGROUND_DELIVERY_LEASE_LOST");
      });
    },
  };
}
