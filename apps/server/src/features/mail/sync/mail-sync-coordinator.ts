import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { createBackgroundTask } from "../../../infrastructure/background/contracts";
import { dispatchBackgroundTasks } from "../../../infrastructure/background/dispatch";
import type { BackgroundTaskResult } from "../../../infrastructure/background/contracts";
import { db } from "../../../infrastructure/database";
import { gmailAccount, mailIndexState } from "../../../infrastructure/database/schema";
import type { RuntimeEnv } from "../../../shared/config/config";
import {
  advanceMailIndex,
  ensureMailIndexState,
  publishMailIndexUpdate,
} from "../query/mail-index";
import { recordMailMetric } from "../mail-metrics";
import { createGmailGateway } from "../provider/gmail-gateway";

const DEFAULT_RETRY_MS = 5_000;

export async function requestMailSync(
  env: RuntimeEnv,
  input: { gmailAccountId: string; historyId?: string; reason: string },
) {
  await ensureMailIndexState(input.gmailAccountId);
  const now = new Date();
  await db
    .update(mailIndexState)
    .set({
      desiredHistoryId: input.historyId
        ? sql`case
            when ${mailIndexState.desiredHistoryId} is null
              or ${mailIndexState.desiredHistoryId}::numeric < ${input.historyId}::numeric
            then ${input.historyId}
            else ${mailIndexState.desiredHistoryId}
          end`
        : mailIndexState.desiredHistoryId,
      nextAttemptAt: now,
      status: sql`case when ${mailIndexState.status} = 'ready' then 'syncing' else ${mailIndexState.status} end`,
      updatedAt: now,
    })
    .where(eq(mailIndexState.gmailAccountId, input.gmailAccountId));
  await dispatchBackgroundTasks(env, [
    createBackgroundTask({
      env,
      kind: "mail.index",
      resourceId: input.gmailAccountId,
    }),
  ]);
  await recordMailMetric("index", {
    code: input.reason,
    connectionId: input.gmailAccountId,
    outcome: "success",
  });
}

export async function processMailSyncTask(
  env: RuntimeEnv,
  gmailAccountId: string,
): Promise<BackgroundTaskResult> {
  const [account] = await db
    .select({ id: gmailAccount.id, status: gmailAccount.status })
    .from(gmailAccount)
    .where(eq(gmailAccount.id, gmailAccountId))
    .limit(1);
  if (!account || account.status !== "connected") return { outcome: "noop" };

  await advanceMailIndex(env, account.id);
  await publishMailIndexUpdate(env, account.id);
  const [state] = await db
    .select({
      appliedHistoryId: mailIndexState.appliedHistoryId,
      desiredHistoryId: mailIndexState.desiredHistoryId,
      historyId: mailIndexState.historyId,
      leaseExpiresAt: mailIndexState.leaseExpiresAt,
      nextAttemptAt: mailIndexState.nextAttemptAt,
      status: mailIndexState.status,
    })
    .from(mailIndexState)
    .where(eq(mailIndexState.gmailAccountId, account.id))
    .limit(1);
  const applied = state?.appliedHistoryId ?? state?.historyId;
  if (state?.status === "ready" && !newerHistory(state.desiredHistoryId, applied)) {
    return { outcome: "completed" };
  }
  const availableAt = latestDate(
    state?.nextAttemptAt,
    state?.leaseExpiresAt,
    new Date(Date.now() + DEFAULT_RETRY_MS),
  );
  return { availableAt: availableAt.toISOString(), outcome: "retry" };
}

export async function advancePendingMailSyncs(env: RuntimeEnv, limit = 5) {
  await db.execute(sql`
    insert into mail_index_state (gmail_account_id, desired_history_id, created_at, updated_at)
    select id, notification_history_id, current_timestamp, current_timestamp
    from gmail_account
    where status = 'connected'
    on conflict (gmail_account_id) do update
      set desired_history_id = case
        when excluded.desired_history_id is null then mail_index_state.desired_history_id
        when mail_index_state.desired_history_id is null
          or mail_index_state.desired_history_id::numeric < excluded.desired_history_id::numeric
        then excluded.desired_history_id
        else mail_index_state.desired_history_id
      end
  `);
  const due = await db
    .select({ gmailAccountId: mailIndexState.gmailAccountId })
    .from(mailIndexState)
    .innerJoin(gmailAccount, eq(gmailAccount.id, mailIndexState.gmailAccountId))
    .where(
      and(
        eq(gmailAccount.status, "connected"),
        lte(mailIndexState.nextAttemptAt, new Date()),
        or(isNull(mailIndexState.leaseExpiresAt), lte(mailIndexState.leaseExpiresAt, new Date())),
        or(
          inArray(mailIndexState.status, ["pending", "backfilling", "syncing", "error"]),
          sql`${mailIndexState.desiredHistoryId} is distinct from coalesce(${mailIndexState.appliedHistoryId}, ${mailIndexState.historyId})`,
        ),
      ),
    )
    .orderBy(asc(mailIndexState.nextAttemptAt), asc(mailIndexState.updatedAt))
    .limit(Math.max(1, Math.min(limit, 25)));
  const results = await Promise.allSettled(
    due.map(({ gmailAccountId }) => processMailSyncTask(env, gmailAccountId)),
  );
  const failed = results.filter((result) => result.status === "rejected").length;
  return { advanced: due.length, failed };
}

export async function pollMailSyncSafety(env: RuntimeEnv, limit = 25) {
  const cutoff = new Date(Date.now() - 5 * 60_000);
  const due = await db
    .select({ account: gmailAccount, state: mailIndexState })
    .from(mailIndexState)
    .innerJoin(gmailAccount, eq(gmailAccount.id, mailIndexState.gmailAccountId))
    .where(
      and(
        eq(gmailAccount.status, "connected"),
        eq(mailIndexState.status, "ready"),
        lte(mailIndexState.updatedAt, cutoff),
      ),
    )
    .orderBy(asc(mailIndexState.updatedAt))
    .limit(Math.max(1, Math.min(limit, 100)));
  let scheduled = 0;
  for (const row of due) {
    const profile = await (
      await createGmailGateway(env, row.account, { trafficClass: "background" })
    ).getProfile();
    await db
      .update(mailIndexState)
      .set({ updatedAt: new Date() })
      .where(eq(mailIndexState.gmailAccountId, row.account.id));
    if (!newerHistory(profile.historyId, row.state.appliedHistoryId ?? row.state.historyId))
      continue;
    await requestMailSync(env, {
      gmailAccountId: row.account.id,
      historyId: profile.historyId,
      reason: "safety_poll",
    });
    scheduled += 1;
  }
  return { checked: due.length, scheduled };
}

export function newerHistory(
  candidate: string | null | undefined,
  applied: string | null | undefined,
) {
  if (!candidate) return false;
  if (!applied) return true;
  return BigInt(candidate) > BigInt(applied);
}

function latestDate(...values: Array<Date | null | undefined>) {
  return new Date(Math.max(...values.filter((value): value is Date => Boolean(value)).map(Number)));
}
