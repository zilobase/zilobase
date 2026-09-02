import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import type {
  DatabaseAutomationMutationFact,
  DatabaseMutationOrigin,
} from "@zilobase/features/databases/automations";
import { databaseAutomationMutationFactSchema } from "@zilobase/features/databases/automations";

import { db, type Database } from "../../../infrastructure/database";
import {
  databaseAutomationEventWindow,
} from "../../../infrastructure/database/schema";

export const DATABASE_AUTOMATION_EVENT_WINDOW_MS = 3_000;

export type { DatabaseAutomationMutationFact, DatabaseMutationOrigin };
export type DatabaseAutomationMutationFactCandidate = Omit<
  DatabaseAutomationMutationFact,
  "changedValues"
> & {
  changedValues: Array<{
    after: unknown;
    before: unknown;
    propertyId: string;
  }>;
};

export type DatabaseAutomationEventWindowState = {
  actorIds: string[];
  afterValues: Record<string, unknown>;
  beforeValues: Record<string, unknown>;
  changedPropertyIds: string[];
  origins: DatabaseMutationOrigin[];
  rowAdded: boolean;
  triggerActorId: string | null;
};

type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const eligibleOrigins = new Set<DatabaseMutationOrigin>([
  "user",
  "button",
  "form",
  "api",
  "import",
  "integration",
  "ai",
]);

const jsonValue = (value: unknown): unknown =>
  value === undefined ? null : value;

const canonicalValue = (value: unknown): string => {
  if (value === undefined || value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalValue).sort().join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalValue(item)}`)
      .join(",")}}`;
  }
  if (typeof value === "number" && Object.is(value, -0)) {
    return "number:0";
  }
  return `${typeof value}:${String(value)}`;
};

export const databaseAutomationValuesEqual = (
  left: unknown,
  right: unknown,
) => canonicalValue(left) === canonicalValue(right);

export function mergeDatabaseAutomationEventWindowState(
  current: DatabaseAutomationEventWindowState,
  fact: DatabaseAutomationMutationFact,
): { changed: boolean; state: DatabaseAutomationEventWindowState } {
  if (!eligibleOrigins.has(fact.origin)) {
    return { changed: false, state: current };
  }

  const beforeValues = { ...current.beforeValues };
  const afterValues = { ...current.afterValues };
  const changedPropertyIds = new Set(current.changedPropertyIds);
  let contributed = fact.rowAdded === true && !current.rowAdded;

  for (const value of fact.changedValues) {
    if (databaseAutomationValuesEqual(value.before, value.after)) {
      continue;
    }

    contributed = true;
    if (!Object.prototype.hasOwnProperty.call(beforeValues, value.propertyId)) {
      beforeValues[value.propertyId] = jsonValue(value.before);
    }
    afterValues[value.propertyId] = jsonValue(value.after);

    if (
      databaseAutomationValuesEqual(
        beforeValues[value.propertyId],
        afterValues[value.propertyId],
      )
    ) {
      delete beforeValues[value.propertyId];
      delete afterValues[value.propertyId];
      changedPropertyIds.delete(value.propertyId);
    } else {
      changedPropertyIds.add(value.propertyId);
    }
  }

  if (!contributed) {
    return { changed: false, state: current };
  }

  const actorIds = [...current.actorIds];
  if (fact.actorId && !actorIds.includes(fact.actorId)) {
    actorIds.push(fact.actorId);
  }
  const origins = current.origins.includes(fact.origin)
    ? current.origins
    : [...current.origins, fact.origin];

  return {
    changed: true,
    state: {
      actorIds,
      afterValues,
      beforeValues,
      changedPropertyIds: [...changedPropertyIds].sort(),
      origins,
      rowAdded: current.rowAdded || fact.rowAdded === true,
      triggerActorId: fact.actorId ?? current.triggerActorId,
    },
  };
}

const emptyWindowState = (): DatabaseAutomationEventWindowState => ({
  actorIds: [],
  afterValues: {},
  beforeValues: {},
  changedPropertyIds: [],
  origins: [],
  rowAdded: false,
  triggerActorId: null,
});

const factGroupKey = (fact: DatabaseAutomationMutationFact) =>
  `${fact.dataSourceId}\u0000${fact.rowId}`;

export const databaseAutomationFactLockKeys = (
  rows: ReadonlyArray<{ dataSourceId: string; rowId: string }>,
) => [
    ...new Set(
      rows.map((row) => JSON.stringify([row.dataSourceId, row.rowId])),
    ),
  ].sort();

export async function lockDatabaseAutomationFactRows(
  tx: Pick<DatabaseTransaction, "execute">,
  rows: ReadonlyArray<{ dataSourceId: string; rowId: string }>,
) {
  const keys = databaseAutomationFactLockKeys(rows);
  for (const key of keys) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
    );
  }
}

export async function captureDatabaseAutomationMutationFacts(
  tx: DatabaseTransaction,
  candidates: readonly DatabaseAutomationMutationFactCandidate[],
  options: { clock?: () => Date } = {},
) {
  const facts = candidates.map((fact) =>
    databaseAutomationMutationFactSchema.parse(fact),
  );
  const grouped = new Map<string, DatabaseAutomationMutationFact[]>();
  for (const fact of facts) {
    if (!eligibleOrigins.has(fact.origin)) {
      continue;
    }
    const group = grouped.get(factGroupKey(fact)) ?? [];
    group.push(fact);
    grouped.set(factGroupKey(fact), group);
  }

  let captured = 0;
  for (const group of grouped.values()) {
    const first = group[0];
    if (!first) {
      continue;
    }

    await lockDatabaseAutomationFactRows(tx, [first]);
    const now = options.clock?.() ?? new Date();
    let existing: typeof databaseAutomationEventWindow.$inferSelect | undefined = (
      await tx
      .select()
      .from(databaseAutomationEventWindow)
      .where(
        and(
          eq(databaseAutomationEventWindow.dataSourceId, first.dataSourceId),
          eq(databaseAutomationEventWindow.rowId, first.rowId),
          eq(databaseAutomationEventWindow.status, "accumulating"),
        ),
      )
      .orderBy(asc(databaseAutomationEventWindow.openedAt))
      .limit(1)
    )[0];

    if (existing && existing.closesAt.getTime() <= now.getTime()) {
      const discarded =
        !existing.rowAdded && existing.changedPropertyIds.length === 0;
      await tx
        .update(databaseAutomationEventWindow)
        .set({
          ...(discarded ? { completedAt: now } : {}),
          status: discarded ? "discarded" : "ready",
          updatedAt: now,
        })
        .where(
          and(
            eq(databaseAutomationEventWindow.id, existing.id),
            eq(databaseAutomationEventWindow.status, "accumulating"),
          ),
        );
      existing = undefined;
    }

    let state: DatabaseAutomationEventWindowState = existing
      ? {
          actorIds: existing.actorIds,
          afterValues: existing.afterValues as Record<string, unknown>,
          beforeValues: existing.beforeValues as Record<string, unknown>,
          changedPropertyIds: existing.changedPropertyIds,
          origins: existing.origins as DatabaseMutationOrigin[],
          rowAdded: existing.rowAdded,
          triggerActorId: existing.triggerActorId,
        }
      : emptyWindowState();
    let changed = false;
    for (const fact of group) {
      const merged = mergeDatabaseAutomationEventWindowState(state, fact);
      state = merged.state;
      changed ||= merged.changed;
    }

    if (!changed) {
      continue;
    }

    if (existing) {
      await tx
        .update(databaseAutomationEventWindow)
        .set({
          actorIds: state.actorIds,
          afterValues: state.afterValues,
          beforeValues: state.beforeValues,
          changedPropertyIds: state.changedPropertyIds,
          lastFactAt: now,
          origins: state.origins,
          rowAdded: state.rowAdded,
          triggerActorId: state.triggerActorId,
          updatedAt: now,
        })
        .where(eq(databaseAutomationEventWindow.id, existing.id));
    } else {
      const closesAt = new Date(
        now.getTime() + DATABASE_AUTOMATION_EVENT_WINDOW_MS,
      );
      await tx.insert(databaseAutomationEventWindow).values({
        actorIds: state.actorIds,
        afterValues: state.afterValues,
        beforeValues: state.beforeValues,
        changedPropertyIds: state.changedPropertyIds,
        closesAt,
        dataSourceId: first.dataSourceId,
        id: crypto.randomUUID(),
        lastFactAt: now,
        nextAttemptAt: closesAt,
        openedAt: now,
        origins: state.origins,
        pageId: first.pageId,
        rowAdded: state.rowAdded,
        rowId: first.rowId,
        status: "accumulating",
        triggerActorId: state.triggerActorId,
        workspaceId: await resolveFactWorkspaceId(tx, first.dataSourceId),
      });
    }
    captured += 1;
  }

  return captured;
}

async function resolveFactWorkspaceId(
  tx: DatabaseTransaction,
  dataSourceId: string,
): Promise<string> {
  const result = await tx.execute(sql<{ workspace_id: string }>`
    select d.workspace_id
    from data_source ds
    inner join database d on d.id = ds.parent_database_id
    where ds.id = ${dataSourceId}
    limit 1
  `);
  const workspaceId = result.rows[0]?.workspace_id as string | undefined;
  if (!workspaceId) {
    throw new Error("Automation mutation fact data source was not found");
  }
  return workspaceId;
}

export async function promoteClosedDatabaseAutomationEventWindows(
  options: { clock?: () => Date; limit?: number } = {},
) {
  const now = options.clock?.() ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? 1_000, 1_000));
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: databaseAutomationEventWindow.id })
      .from(databaseAutomationEventWindow)
      .where(
        and(
          eq(databaseAutomationEventWindow.status, "accumulating"),
          lte(databaseAutomationEventWindow.closesAt, now),
        ),
      )
      .orderBy(asc(databaseAutomationEventWindow.closesAt))
      .limit(limit);
    if (due.length === 0) {
      return 0;
    }

    const promoted = await tx
      .update(databaseAutomationEventWindow)
      .set({
        completedAt: sql<Date | null>`case
          when not ${databaseAutomationEventWindow.rowAdded}
            and cardinality(${databaseAutomationEventWindow.changedPropertyIds}) = 0
          then ${now}
          else ${databaseAutomationEventWindow.completedAt}
        end`,
        status: sql<string>`case
          when ${databaseAutomationEventWindow.rowAdded}
            or cardinality(${databaseAutomationEventWindow.changedPropertyIds}) > 0
          then 'ready'
          else 'discarded'
        end`,
        updatedAt: now,
      })
      .where(
        and(
          inArray(
            databaseAutomationEventWindow.id,
            due.map((window) => window.id),
          ),
          eq(databaseAutomationEventWindow.status, "accumulating"),
        ),
      )
      .returning({ id: databaseAutomationEventWindow.id });
    return promoted.length;
  });
}

export async function getDatabaseAutomationEventCaptureMetrics() {
  const rows = await db
    .select({
      count: sql<number>`count(*)::integer`,
      oldestOpenedAt: sql<Date | null>`min(${databaseAutomationEventWindow.openedAt})`,
      status: databaseAutomationEventWindow.status,
    })
    .from(databaseAutomationEventWindow)
    .groupBy(databaseAutomationEventWindow.status);

  return rows.map((row) => ({
    count: row.count,
    oldestAgeMs: row.oldestOpenedAt
      ? Math.max(0, Date.now() - row.oldestOpenedAt.getTime())
      : null,
    status: row.status,
  }));
}
