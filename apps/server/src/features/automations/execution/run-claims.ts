import { and, asc, eq, gt, inArray, lte, or, sql } from "drizzle-orm";

import { db } from "../../../infrastructure/database";
import { databaseAutomationRun } from "../../../infrastructure/database/schema";

const RUN_LEASE_MS = 2 * 60_000;
const WORKSPACE_RUN_LIMIT = 10;

export function selectWorkspaceRunClaims(
  candidates: Array<{ id: string; workspaceId: string }>,
  running: Array<{ count: number; workspaceId: string }>,
  limit: number,
) {
  const available = new Map<string, number>();
  for (const { workspaceId } of candidates) {
    if (!available.has(workspaceId)) {
      available.set(
        workspaceId,
        WORKSPACE_RUN_LIMIT -
          (running.find((row) => row.workspaceId === workspaceId)?.count ?? 0),
      );
    }
  }
  const selected: string[] = [];
  for (const row of candidates) {
    const remaining = available.get(row.workspaceId) ?? 0;
    if (remaining <= 0 || selected.length >= limit) continue;
    selected.push(row.id);
    available.set(row.workspaceId, remaining - 1);
  }
  return selected;
}

export async function claimAutomationRuns(
  workerId: string,
  limit: number,
  runId?: string,
) {
  return await db.transaction(async (tx) => {
    const clock = await tx.execute(
      sql<{ now: Date }>`select current_timestamp as now`,
    );
    const now = new Date(clock.rows[0]!.now as Date | string);
    const rows = await tx
      .select({
        id: databaseAutomationRun.id,
        status: databaseAutomationRun.status,
        workspaceId: databaseAutomationRun.workspaceId,
      })
      .from(databaseAutomationRun)
      .where(
        and(
          runId ? eq(databaseAutomationRun.id, runId) : undefined,
          or(
            and(
              eq(databaseAutomationRun.status, "queued"),
              lte(databaseAutomationRun.availableAt, now),
            ),
            and(
              eq(databaseAutomationRun.status, "running"),
              lte(databaseAutomationRun.leaseExpiresAt, now),
            ),
          ),
        ),
      )
      .orderBy(asc(databaseAutomationRun.createdAt))
      .limit(250)
      .for("update", { skipLocked: true });
    if (!rows.length) {
      return {
        claims: [] as Array<{ id: string; recoveredLease?: boolean }>,
        deferred: false,
      };
    }
    const workspaceIds = [
      ...new Set(rows.map(({ workspaceId }) => workspaceId)),
    ].sort();
    for (const workspaceId of workspaceIds) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`database-automation:${workspaceId}`}))`,
      );
    }
    const running = await tx
      .select({
        count: sql<number>`count(*)::integer`,
        workspaceId: databaseAutomationRun.workspaceId,
      })
      .from(databaseAutomationRun)
      .where(
        and(
          inArray(databaseAutomationRun.workspaceId, workspaceIds),
          eq(databaseAutomationRun.status, "running"),
          gt(databaseAutomationRun.leaseExpiresAt, now),
        ),
      )
      .groupBy(databaseAutomationRun.workspaceId);
    const selected = selectWorkspaceRunClaims(rows, running, limit);
    if (!selected.length) {
      return {
        claims: [] as Array<{ id: string; recoveredLease?: boolean }>,
        deferred: Boolean(runId),
      };
    }
    const claimedRows = await tx
      .update(databaseAutomationRun)
      .set({
        attempts: sql`${databaseAutomationRun.attempts} + 1`,
        leaseExpiresAt: new Date(now.getTime() + RUN_LEASE_MS),
        leaseOwner: workerId,
        startedAt: sql`coalesce(${databaseAutomationRun.startedAt}, ${now})`,
        status: "running",
        updatedAt: now,
      })
      .where(inArray(databaseAutomationRun.id, selected))
      .returning({ id: databaseAutomationRun.id });
    const claims = claimedRows.map((claim) => ({
      ...claim,
      recoveredLease:
        rows.find((row) => row.id === claim.id)?.status === "running",
    }));
    return { claims, deferred: false };
  });
}

export async function renewRunLease(runId: string, workerId: string) {
  const [renewed] = await db
    .update(databaseAutomationRun)
    .set({
      leaseExpiresAt: sql`current_timestamp + (${RUN_LEASE_MS} * interval '1 millisecond')`,
      updatedAt: sql`current_timestamp`,
    })
    .where(
      and(
        eq(databaseAutomationRun.id, runId),
        eq(databaseAutomationRun.status, "running"),
        eq(databaseAutomationRun.leaseOwner, workerId),
      ),
    )
    .returning({ id: databaseAutomationRun.id });
  return Boolean(renewed);
}
