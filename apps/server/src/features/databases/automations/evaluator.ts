import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  evaluateDatabaseFilters,
  normalizeDatabaseFilters,
} from "@zilobase/features/databases/filter";
import {
  databaseAutomationDefinitionSchema,
  type DatabaseAutomationDefinition,
} from "@zilobase/features/databases/automations";

import { isDatabaseAutomationExecutionEnabled, type RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import {
  database,
  databaseAutomation,
  databaseAutomationEventWindow,
  databaseAutomationRevision,
  databaseAutomationRun,
  databaseProperty,
  databaseRow,
  databaseView,
  dataSource,
  page,
  pageProperty,
  pagePropertyValue,
} from "../../../infrastructure/database/schema";
import { createBackgroundTask } from "../../../infrastructure/background/contracts";
import { dispatchBackgroundTasks } from "../../../infrastructure/background/dispatch";
import { recordRecoveredBackgroundLease } from "../../../infrastructure/background/telemetry";
import { requireDataSourceAccess } from "../access/data-source-access";
import { promoteClosedDatabaseAutomationEventWindows } from "./event-capture";
import { matchesDatabaseAutomationEvent } from "./trigger-evaluator";

const EVENT_LEASE_MS = 60_000;

export async function drainDatabaseAutomationEventWindows(
  env: RuntimeEnv,
  options: { limit?: number; windowId?: string; workerId?: string } = {},
) {
  if (!isDatabaseAutomationExecutionEnabled(env)) return { claimed: 0, completed: 0, retried: 0, runsCreated: 0 };
  await promoteClosedDatabaseAutomationEventWindows({ limit: options.limit, windowId: options.windowId });
  const workerId = options.workerId ?? `automation-evaluator:${crypto.randomUUID()}`;
  const limit = Math.max(1, Math.min(options.limit ?? 50, 100));
  const claimed = await db.transaction(async (tx) => {
    const clock = await tx.execute(sql<{ now: Date }>`select current_timestamp as now`);
    const now = new Date(clock.rows[0]!.now as Date | string);
    const rows = await tx
      .select({
        id: databaseAutomationEventWindow.id,
        status: databaseAutomationEventWindow.status,
      })
      .from(databaseAutomationEventWindow)
      .where(
        and(
          options.windowId ? eq(databaseAutomationEventWindow.id, options.windowId) : undefined,
          or(
          and(
            eq(databaseAutomationEventWindow.status, "ready"),
            lte(databaseAutomationEventWindow.nextAttemptAt, now),
          ),
          and(
            eq(databaseAutomationEventWindow.status, "processing"),
            lte(databaseAutomationEventWindow.leaseExpiresAt, now),
          ),
          ),
        ),
      )
      .orderBy(asc(databaseAutomationEventWindow.closesAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (!rows.length) return [];
    const claimedRows = await tx
      .update(databaseAutomationEventWindow)
      .set({
        attempts: databaseAutomationEventWindow.attempts,
        leaseExpiresAt: new Date(now.getTime() + EVENT_LEASE_MS),
        leaseOwner: workerId,
        status: "processing",
        updatedAt: now,
      })
      .where(inArray(databaseAutomationEventWindow.id, rows.map((row) => row.id)))
      .returning();
    return claimedRows.map((window) => ({
      ...window,
      recoveredLease: rows.find((row) => row.id === window.id)?.status === "processing",
    }));
  });

  let completed = 0;
  let retried = 0;
  let runsCreated = 0;
  for (const window of claimed) {
    if (window.recoveredLease) {
      recordRecoveredBackgroundLease(env, "automation.event_window");
    }
    try {
      const runIds = await evaluateWindow(window.id, workerId);
      runsCreated += runIds.length;
      completed += 1;
      await dispatchBackgroundTasks(env, runIds.map((runId) =>
        createBackgroundTask({ env, kind: "automation.run", resourceId: runId })
      ));
    } catch (error) {
      const attempts = window.attempts + 1;
      const availableAt = new Date(Date.now() + Math.min(60_000, 1_000 * 2 ** attempts));
      await db
        .update(databaseAutomationEventWindow)
        .set({
          attempts,
          leaseExpiresAt: null,
          leaseOwner: null,
          nextAttemptAt: availableAt,
          status: "ready",
          terminalReason: error instanceof Error ? error.message.slice(0, 500) : "Evaluation failed",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(databaseAutomationEventWindow.id, window.id),
            eq(databaseAutomationEventWindow.leaseOwner, workerId),
          ),
        );
      retried += 1;
      await dispatchBackgroundTasks(env, [createBackgroundTask({
        availableAt,
        env,
        kind: "automation.event_window",
        resourceId: window.id,
      })]);
    }
  }
  return { claimed: claimed.length, completed, retried, runsCreated };
}

export async function processDatabaseAutomationEventWindow(
  env: RuntimeEnv,
  input: { windowId: string; workerId: string },
) {
  if (!isDatabaseAutomationExecutionEnabled(env)) return { outcome: "noop" as const };
  const result = await drainDatabaseAutomationEventWindows(env, {
    limit: 1,
    windowId: input.windowId,
    workerId: input.workerId,
  });
  if (result.completed) return { outcome: "completed" as const };
  const [window] = await db.select({
    closesAt: databaseAutomationEventWindow.closesAt,
    nextAttemptAt: databaseAutomationEventWindow.nextAttemptAt,
    status: databaseAutomationEventWindow.status,
  }).from(databaseAutomationEventWindow)
    .where(eq(databaseAutomationEventWindow.id, input.windowId))
    .limit(1);
  if (!window || ["completed", "discarded"].includes(window.status)) {
    return { outcome: "noop" as const };
  }
  const availableAt = window.status === "accumulating" ? window.closesAt : window.nextAttemptAt;
  return { availableAt: availableAt.toISOString(), outcome: "retry" as const };
}

async function evaluateWindow(windowId: string, workerId: string) {
  return db.transaction(async (tx) => {
    const [window] = await tx
      .select()
      .from(databaseAutomationEventWindow)
      .where(
        and(
          eq(databaseAutomationEventWindow.id, windowId),
          eq(databaseAutomationEventWindow.status, "processing"),
          eq(databaseAutomationEventWindow.leaseOwner, workerId),
        ),
      )
      .limit(1)
      .for("update");
    if (!window) return [];

    const [source] = await tx
      .select({ config: database.config, parentDatabaseId: dataSource.parentDatabaseId })
      .from(dataSource)
      .innerJoin(database, eq(database.id, dataSource.parentDatabaseId))
      .where(eq(dataSource.id, window.dataSourceId))
      .limit(1);
    const [row] = await tx
      .select({
        createdById: databaseRow.createdById,
        id: databaseRow.id,
        lastEditedById: databaseRow.lastEditedById,
        pageId: databaseRow.pageId,
        title: page.name,
      })
      .from(databaseRow)
      .innerJoin(page, eq(page.id, databaseRow.pageId))
      .where(
        and(
          eq(databaseRow.id, window.rowId),
          eq(databaseRow.dataSourceId, window.dataSourceId),
          isNull(databaseRow.deletedAt),
          isNull(page.deletedAt),
        ),
      )
      .limit(1);
    if (!source || !row) {
      await completeWindow(tx, window.id, workerId, "row_unavailable");
      return [];
    }

    const [properties, values, automations] = await Promise.all([
      tx
        .select({ config: pageProperty.config, id: pageProperty.id, type: pageProperty.type })
        .from(databaseProperty)
        .innerJoin(pageProperty, eq(pageProperty.id, databaseProperty.propertyId))
        .where(
          and(
            eq(databaseProperty.dataSourceId, window.dataSourceId),
            isNull(pageProperty.deletedAt),
          ),
        ),
      tx
        .select({ propertyId: pagePropertyValue.propertyId, value: pagePropertyValue.value })
        .from(pagePropertyValue)
        .where(eq(pagePropertyValue.pageId, row.pageId)),
      tx
        .select({ automation: databaseAutomation, revision: databaseAutomationRevision })
        .from(databaseAutomation)
        .innerJoin(
          databaseAutomationRevision,
          eq(databaseAutomation.currentRevisionId, databaseAutomationRevision.id),
        )
        .where(
          and(
            eq(databaseAutomation.dataSourceId, window.dataSourceId),
            eq(databaseAutomation.status, "active"),
            isNull(databaseAutomation.deletedAt),
          ),
        ),
    ]);
    const propertyMap = new Map(properties.map((property) => [property.id, property]));
    const finalValues: Record<string, unknown> = {
      ...Object.fromEntries(values.map((value) => [value.propertyId, value.value])),
      ...window.afterValues as Record<string, unknown>,
      name: row.title,
    };
    const createdRunIds: string[] = [];
    const triggerTime = window.lastFactAt;
    const sourceLocked = Boolean(
      source.config &&
      typeof source.config === "object" &&
      !Array.isArray(source.config) &&
      (source.config as { locked?: unknown }).locked === true,
    );

    for (const record of automations) {
      const parsed = databaseAutomationDefinitionSchema.safeParse(record.revision.definition);
      if (!parsed.success || parsed.data.trigger.kind !== "event") continue;
      const definition = parsed.data;
      if (!matchesDatabaseAutomationEvent(definition, {
        afterValues: window.afterValues as Record<string, unknown>,
        changedPropertyIds: window.changedPropertyIds,
        now: triggerTime,
        properties: propertyMap,
        rowAdded: window.rowAdded,
        timezone: definition.timezone,
      })) continue;

      let skipReason: string | null = sourceLocked ? "locked_database" : null;
      if (!skipReason && record.automation.ownerUserId) {
        try {
          await requireDataSourceAccess(
            window.dataSourceId,
            record.automation.ownerUserId,
            "full",
          );
        } catch {
          skipReason = "revoked_authority";
        }
      } else if (!record.automation.ownerUserId) {
        skipReason = "revoked_authority";
      }
      if (!skipReason && definition.scope.type === "view") {
        const [view] = await tx
          .select({ config: databaseView.config })
          .from(databaseView)
          .where(
            and(
              eq(databaseView.id, definition.scope.viewId),
              eq(databaseView.dataSourceId, window.dataSourceId),
            ),
          )
          .limit(1);
        if (!view || !matchesView(view.config, finalValues, propertyMap, definition, triggerTime)) {
          skipReason = "view_mismatch";
        }
      }

      const runId = crypto.randomUUID();
      const [created] = await tx
        .insert(databaseAutomationRun)
        .values({
          automationId: record.automation.id,
          createdAt: new Date(),
          dataSourceId: window.dataSourceId,
          definitionHash: record.revision.definitionHash,
          eventWindowId: window.id,
          finishedAt: skipReason ? new Date() : null,
          id: runId,
          inputSnapshot: {
            afterValues: window.afterValues,
            beforeValues: window.beforeValues,
            changedPropertyIds: window.changedPropertyIds,
            origins: window.origins,
          },
          revisionId: record.revision.id,
          skipReason,
          status: skipReason ? "skipped" : "queued",
          triggerActorId: window.triggerActorId,
          triggerPageId: window.pageId,
          triggerRowId: window.rowId,
          triggerTime,
          updatedAt: new Date(),
          workspaceId: window.workspaceId,
        })
        .onConflictDoNothing()
        .returning({ id: databaseAutomationRun.id });
      if (created && !skipReason) createdRunIds.push(created.id);
    }

    await completeWindow(tx, window.id, workerId, null);
    return createdRunIds;
  });
}

function matchesView(
  config: unknown,
  values: Record<string, unknown>,
  properties: Map<string, { id: string; type: string }>,
  definition: DatabaseAutomationDefinition,
  now: Date,
) {
  const filters =
    config && typeof config === "object" && Array.isArray((config as { filters?: unknown }).filters)
      ? normalizeDatabaseFilters((config as { filters: unknown[] }).filters)
      : [];
  return evaluateDatabaseFilters(filters, {
    getPropertyType: (propertyId) => properties.get(propertyId)?.type,
    getPropertyValues: (propertyId) => stringifyValues(values[propertyId]),
    now,
    timezone: definition.timezone,
  });
}

const stringifyValues = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value]).flatMap((item) =>
    item === null || item === undefined
      ? []
      : typeof item === "string" || typeof item === "number" || typeof item === "boolean"
        ? [String(item)]
        : [],
  );

async function completeWindow(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  windowId: string,
  workerId: string,
  terminalReason: string | null,
) {
  const now = new Date();
  await tx
    .update(databaseAutomationEventWindow)
    .set({
      completedAt: now,
      leaseExpiresAt: null,
      leaseOwner: null,
      status: terminalReason ? "discarded" : "completed",
      terminalReason,
      updatedAt: now,
    })
    .where(
      and(
        eq(databaseAutomationEventWindow.id, windowId),
        eq(databaseAutomationEventWindow.leaseOwner, workerId),
      ),
    );
}
