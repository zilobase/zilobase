import { sql } from "drizzle-orm";

import type { RuntimeEnv } from "../../shared/config/config";
import { db } from "../database";
import { backgroundMaintenanceTask } from "../database/schema";
import { getBackgroundCellId, type BackgroundLane } from "./contracts";

type ReadinessProbe = () => {
  coordinatorReady: boolean | null;
  listenerReady: boolean | null;
};
let readinessProbe: ReadinessProbe | null = null;

export function setBackgroundReadinessProbe(probe: ReadinessProbe | null) {
  readinessProbe = probe;
}

export function isBackgroundCoordinatorReady() {
  return readinessProbe?.().coordinatorReady !== false;
}

export async function getBackgroundOperationalSnapshot(env: RuntimeEnv) {
  const now = new Date();
  const result = await db.execute(sql<{
    lane: BackgroundLane;
    oldest_due_at: Date | string | null;
    ready_count: number | string;
  }>`
    with work(lane, due_at) as (
      select 'fast', least(closes_at, next_attempt_at) from database_automation_event_window
        where status in ('accumulating', 'ready')
      union all select 'fast', lease_expires_at from database_automation_event_window where status = 'processing'
      union all select 'fast', next_attempt_at from database_realtime_outbox
      union all select 'fast', next_attempt_at from navigation_realtime_outbox
      union all select 'fast', next_attempt_at from in_product_notification_outbox where status = 'pending'
      union all select 'automation', available_at from database_automation_run where status = 'queued'
      union all select 'automation', lease_expires_at from database_automation_run where status = 'running'
      union all select 'ai', available_at from ai_job where status = 'queued'
      union all select 'ai', lease_expires_at from ai_job where status = 'running'
      union all select 'mail', next_attempt_at from mail_database_sync_outbox where status in ('pending', 'retry')
      union all select 'mail', lease_expires_at from mail_database_sync_outbox where status = 'processing'
      union all
        select 'mail', coalesce(s.updated_at, a.updated_at)
        from gmail_account a
        left join mail_index_state s on s.gmail_account_id = a.id
        where a.status = 'connected'
          and (s.gmail_account_id is null or s.status <> 'ready' or a.notification_history_id is distinct from s.history_id)
    )
    select lane, count(*) filter (where due_at <= current_timestamp)::integer as ready_count,
      min(due_at) filter (where due_at <= current_timestamp) as oldest_due_at
    from work group by lane
  `);
  const leases = await db.execute(sql<{
    active_count: number | string;
    stale_count: number | string;
  }>`
    with leases(expires_at) as (
      select lease_expires_at from database_automation_event_window where status = 'processing'
      union all select lease_expires_at from database_automation_run where status = 'running'
      union all select lease_expires_at from ai_job where status = 'running'
      union all select lease_expires_at from mail_database_sync_outbox where status = 'processing'
    )
    select
      count(*) filter (where expires_at > current_timestamp)::integer as active_count,
      count(*) filter (where expires_at is null or expires_at <= current_timestamp)::integer as stale_count
    from leases
  `);
  const maintenance = await db.select({
    consecutiveFailures: backgroundMaintenanceTask.consecutiveFailures,
    lastErrorCode: backgroundMaintenanceTask.lastErrorCode,
    lastFailedAt: backgroundMaintenanceTask.lastFailedAt,
    lastSucceededAt: backgroundMaintenanceTask.lastSucceededAt,
    taskKey: backgroundMaintenanceTask.taskKey,
  }).from(backgroundMaintenanceTask);
  const byLane = new Map(result.rows.map((row) => [row.lane, row]));
  const lanes = (["fast", "automation", "ai", "mail"] as const).map((lane) => {
    const row = byLane.get(lane);
    const rawOldestDueAt = row?.oldest_due_at as Date | string | null | undefined;
    const oldestDueAt = rawOldestDueAt ? new Date(rawOldestDueAt) : null;
    return {
      lane,
      oldestDueAgeMs: oldestDueAt ? Math.max(0, now.getTime() - oldestDueAt.getTime()) : null,
      readyCount: Number(row?.ready_count ?? 0),
    };
  });
  const lease = leases.rows[0];
  const readiness = readinessProbe?.() ?? {
    coordinatorReady: null,
    listenerReady: null,
  };
  const heartbeat = maintenance.find((task) => task.taskKey === "background.snapshot");
  const heartbeatFresh = Boolean(
    heartbeat?.lastSucceededAt &&
    now.getTime() - heartbeat.lastSucceededAt.getTime() < 2 * 60_000,
  );
  const healthy = lanes.every((lane) => lane.oldestDueAgeMs === null || lane.oldestDueAgeMs < 120_000) &&
    Number(lease?.stale_count ?? 0) === 0 &&
    maintenance.every((task) => task.consecutiveFailures < 2) &&
    heartbeatFresh &&
    readiness.coordinatorReady !== false;
  return {
    capturedAt: now.toISOString(),
    cellId: getBackgroundCellId(env),
    coordinator: readiness,
    heartbeatFresh,
    healthy,
    lanes,
    leases: {
      active: Number(lease?.active_count ?? 0),
      stale: Number(lease?.stale_count ?? 0),
    },
    maintenance,
    runtime: env.HYPERDRIVE ? "cloudflare" : "node",
  };
}
