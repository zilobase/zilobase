import { eq, and, lte, sql } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import { backgroundTransaction } from "../../../infrastructure/background/publication";
import { getBackgroundCellId } from "../../../infrastructure/background/contracts";
import {
  databaseAutomation,
  databaseAutomationRevision,
  aiAgentTrigger,
} from "../../../infrastructure/database/schema";
import {
  databaseAutomationDefinitionSchema,
  getNextDatabaseAutomationOccurrence,
} from "@zilobase/features/automations";
import { computeNextAgentSchedule } from "../../../features/ai/agents/agent-definition";
import type { RuntimeEnv } from "../../../shared/config/config";

export type CutoverOptions = {
  cellId: string;
  cutoff: Date;
  isolatedDatabase: boolean;
  runtimesStopped: boolean;
};
export function assertCutoverScope(env: RuntimeEnv, options: CutoverOptions) {
  if (!options.cellId || options.cellId !== getBackgroundCellId(env))
    throw new Error("CUTOVER_CELL_MISMATCH");
  if (!Number.isFinite(options.cutoff.getTime())) throw new Error("CUTOVER_CUTOFF_INVALID");
}

export async function previewBackgroundCutover(env: RuntimeEnv, options: CutoverOptions) {
  assertCutoverScope(env, options);
  const cutoff = options.cutoff;
  const result = await db.execute<{ kind: string; count: number }>(sql`
    select 'ai_jobs' as kind, count(*)::int as count from ai_job where created_at <= ${cutoff} and status in ('queued','running')
    union all select 'agent_runs', count(*)::int from ai_agent_run where created_at <= ${cutoff} and status in ('queued','running','waiting_approval')
    union all select 'automation_runs', count(*)::int from database_automation_run where created_at <= ${cutoff} and status in ('queued','running')
    union all select 'event_windows', count(*)::int from database_automation_event_window where created_at <= ${cutoff} and status in ('accumulating','ready','processing')
    union all select 'pending_approvals', count(*)::int from ai_agent_pending_action where created_at <= ${cutoff} and status in ('pending','executing')
    union all select 'dispatches', count(*)::int from background_dispatch where cell_id = ${options.cellId} and created_at <= ${cutoff} and status in ('pending','published','running')
    union all select 'foreign_cell_dispatches', count(*)::int from background_dispatch where cell_id <> ${options.cellId}
    union all select 'calendar_cursors', count(*)::int from calendar_provider_calendar where (dirty_at is null or dirty_at <= ${cutoff}) and (page_token is not null or lease_id is not null or dirty_at <= ${cutoff})
    union all select 'newer_unfinished_work', (
      (select count(*) from ai_job where created_at > ${cutoff} and status in ('queued','running')) +
      (select count(*) from ai_agent_run where created_at > ${cutoff} and status in ('queued','running','waiting_approval')) +
      (select count(*) from database_automation_run where created_at > ${cutoff} and status in ('queued','running')) +
      (select count(*) from database_automation_event_window where created_at > ${cutoff} and status in ('accumulating','ready','processing')) +
      (select count(*) from background_dispatch where cell_id=${options.cellId} and created_at > ${cutoff} and status in ('pending','published','running'))
    )::int
  `);
  return {
    cellId: options.cellId,
    cutoff: cutoff.toISOString(),
    counts: Object.fromEntries(result.rows.map((row) => [row.kind, Number(row.count)])),
    canApply:
      options.isolatedDatabase &&
      options.runtimesStopped &&
      !result.rows.some(
        (row) =>
          ["foreign_cell_dispatches", "newer_unfinished_work"].includes(row.kind) &&
          Number(row.count) > 0,
      ),
  };
}

/** The legacy feature schema is deployment-owned and has no cell discriminator. */
export async function applyBackgroundCutover(
  env: RuntimeEnv,
  options: CutoverOptions,
  purge: () => Promise<void>,
) {
  assertCutoverScope(env, options);
  if (!options.isolatedDatabase)
    throw new Error("CUTOVER_REQUIRES_ISOLATED_CELL_DATABASE_OR_SCHEMA");
  if (!options.runtimesStopped)
    throw new Error("CUTOVER_REQUIRES_STOPPED_PRODUCERS_CONSUMERS_AND_CRON");
  const preview = await previewBackgroundCutover(env, options);
  if (preview.counts.foreign_cell_dispatches) throw new Error("CUTOVER_FOREIGN_CELL_DATA");
  if (preview.counts.newer_unfinished_work) throw new Error("CUTOVER_CUTOFF_PRECEDES_ACTIVE_WORK");
  const cutoff = options.cutoff;
  const fresh = new Date(cutoff.getTime() + 1);
  await backgroundTransaction(
    env,
    async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${"background-cutover:" + options.cellId}))`,
      );
      await tx.execute(sql`
      update ai_chat_upload set status='rejected', updated_at=${cutoff}
      where status in ('pending','processing') and id in (
        select input->>'uploadId' from ai_job where type='upload-extraction' and created_at <= ${cutoff} and status in ('queued','running'))`);
      await tx.execute(sql`
      update ai_mcp_materialization set status='failed', error_code='QUEUE_CUTOVER_CANCELLED', completed_at=${cutoff}, updated_at=${cutoff}
      where status in ('queued','running') and ai_job_id in (select id from ai_job where created_at <= ${cutoff} and status in ('queued','running'))`);
      await tx.execute(sql`
      update meeting set status='failed', updated_at=${cutoff}
      where status='processing' and id in (select input->>'meetingId' from ai_job where type='meeting-summary' and created_at <= ${cutoff} and status in ('queued','running'))`);
      await tx.execute(sql`
      update ai_agent_conversation_message set status='cancelled', updated_at=${cutoff}
      where kind in ('run','approval') and status='pending' and run_id in (select id from ai_agent_run where created_at <= ${cutoff} and status in ('queued','running','waiting_approval'))`);
      await tx.execute(sql`
      update ai_agent_tool_execution set outcome_unknown=(outcome_unknown or effect='write'), status='cancelled', error_code='QUEUE_CUTOVER_CANCELLED', completed_at=${cutoff}, updated_at=${cutoff}
      where status='running' and agent_run_id in (select id from ai_agent_run where created_at <= ${cutoff} and status in ('queued','running','waiting_approval'))`);
      await tx.execute(
        sql`update ai_agent_pending_action set status='rejected', error='QUEUE_CUTOVER_CANCELLED', completed_at=${cutoff}, rejected_at=${cutoff}, updated_at=${cutoff} where created_at <= ${cutoff} and status in ('pending','executing')`,
      );
      await tx.execute(
        sql`update ai_job set status='cancelled', dedupe_key=dedupe_key || ':cutover:' || id, error='QUEUE_CUTOVER_CANCELLED', completed_at=${cutoff}, worker_id=null, lease_expires_at=null, updated_at=${cutoff} where created_at <= ${cutoff} and status in ('queued','running')`,
      );
      await tx.execute(
        sql`update ai_agent_run set status='cancelled', error_code='QUEUE_CUTOVER_CANCELLED', error_summary='Cancelled during queue cutover.', completed_at=${cutoff}, lease_owner=null, lease_expires_at=null, updated_at=${cutoff} where created_at <= ${cutoff} and status in ('queued','running','waiting_approval')`,
      );
      await tx.execute(
        sql`update database_automation_step_run set status='skipped', error_code='QUEUE_CUTOVER_CANCELLED', error_summary='Cancelled during queue cutover.', finished_at=${cutoff}, updated_at=${cutoff} where status in ('queued','running') and run_id in (select id from database_automation_run where created_at <= ${cutoff} and status in ('queued','running'))`,
      );
      await tx.execute(
        sql`update database_automation_run set status='cancelled', error_code='QUEUE_CUTOVER_CANCELLED', error_summary='Cancelled during queue cutover.', finished_at=${cutoff}, lease_owner=null, lease_expires_at=null, updated_at=${cutoff} where created_at <= ${cutoff} and status in ('queued','running')`,
      );
      await tx.execute(
        sql`update database_automation_event_window set status='discarded', terminal_reason='QUEUE_CUTOVER_CANCELLED', lease_owner=null, lease_expires_at=null, updated_at=${cutoff} where created_at <= ${cutoff} and status in ('accumulating','ready','processing')`,
      );
      await tx.execute(
        sql`update background_dispatch set status='cancelled', error_code='QUEUE_CUTOVER_CANCELLED', completed_at=${cutoff}, lease_owner=null, lease_expires_at=null, updated_at=${cutoff} where cell_id=${options.cellId} and created_at <= ${cutoff} and status in ('pending','published','running')`,
      );
      await tx.execute(
        sql`delete from database_realtime_outbox where event_id in (select id from database_mutation_event where committed_at <= ${cutoff})`,
      );
      await tx.execute(
        sql`update in_product_notification_outbox set status='failed', updated_at=${cutoff} where status='pending' and created_at <= ${cutoff}`,
      );
      await tx.execute(sql`delete from navigation_realtime_outbox where committed_at <= ${cutoff}`);
      await tx.execute(
        sql`update background_maintenance_task set lease_owner=null, lease_expires_at=null, next_run_at=${fresh}, consecutive_failures=0, last_error_code=null, updated_at=${cutoff}`,
      );
    },
    { publishAfterCommit: false },
  );
  // Purge precedes schedule/cursor advancement. A failed purge leaves a safely stopped deployment;
  // rerunning with the exact same cutoff completes the idempotent remaining steps.
  await purge();
  await backgroundTransaction(
    env,
    async (tx) => {
      const schedules = await tx
        .select({ definition: databaseAutomationRevision.definition, id: databaseAutomation.id })
        .from(databaseAutomation)
        .innerJoin(
          databaseAutomationRevision,
          eq(databaseAutomationRevision.id, databaseAutomation.currentRevisionId),
        )
        .where(
          and(eq(databaseAutomation.status, "active"), lte(databaseAutomation.nextRunAt, cutoff)),
        )
        .for("update", { of: databaseAutomation });
      for (const record of schedules) {
        const parsed = databaseAutomationDefinitionSchema.safeParse(record.definition);
        const nextRunAt =
          parsed.success && parsed.data.trigger.kind === "schedule"
            ? getNextDatabaseAutomationOccurrence(parsed.data.trigger.schedule, cutoff)
            : null;
        await tx
          .update(databaseAutomation)
          .set({ nextRunAt, updatedAt: cutoff })
          .where(eq(databaseAutomation.id, record.id));
      }
      const triggers = await tx
        .select()
        .from(aiAgentTrigger)
        .where(
          and(
            eq(aiAgentTrigger.kind, "schedule"),
            eq(aiAgentTrigger.status, "active"),
            lte(aiAgentTrigger.nextRunAt, cutoff),
          ),
        )
        .for("update");
      for (const trigger of triggers)
        await tx
          .update(aiAgentTrigger)
          .set({
            nextRunAt: computeNextAgentSchedule(trigger.config as Record<string, unknown>, cutoff),
            updatedAt: cutoff,
          })
          .where(eq(aiAgentTrigger.id, trigger.id));
      await tx.execute(
        sql`update calendar_provider_calendar set page_token=null, sync_token=null, lease_id=null, lease_expires_at=null, dirty_at=${fresh} where (dirty_at is null or dirty_at <= ${cutoff}) and (page_token is not null or lease_id is not null or dirty_at <= ${cutoff})`,
      );
      await tx.execute(
        sql`update calendar_watch_channel set dirty_at=${fresh} where calendar_id is null and dirty_at <= ${cutoff}`,
      );
    },
    { publishAfterCommit: false },
  );
  return { ...preview, applied: true };
}
