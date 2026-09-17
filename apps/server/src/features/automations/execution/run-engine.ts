import { claimAutomationRuns } from "./run-claims";
import { executeClaimedRun } from "./run-lifecycle";
export { selectWorkspaceRunClaims } from "./run-claims";
import { eq } from "drizzle-orm";
import { isDatabaseAutomationExecutionEnabled, type RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import { databaseAutomationRun } from "../../../infrastructure/database/schema";

import { recordRecoveredBackgroundLease } from "../../../infrastructure/background/telemetry";

export class AutomationRunCapacityError extends Error {
  readonly code = "AUTOMATION_WORKSPACE_CAPACITY";
  constructor() {
    super("Automation workspace concurrency is currently full");
    this.name = "AutomationRunCapacityError";
  }
}

export async function drainDatabaseAutomationRuns(
  env: RuntimeEnv,
  options: { limit?: number; runId?: string; workerId?: string } = {},
) {
  if (!isDatabaseAutomationExecutionEnabled(env)) return { claimed: 0, failed: 0, succeeded: 0 };
  const workerId = options.workerId ?? `automation-runner:${crypto.randomUUID()}`;
  const limit = Math.max(1, Math.min(options.limit ?? 10, 50));
  const claimed = await claimAutomationRuns(workerId, limit, options.runId);
  if (claimed.deferred) throw new AutomationRunCapacityError();

  let failed = 0;
  let retried = 0;
  let succeeded = 0;
  for (const run of claimed.claims) {
    if (run.recoveredLease) recordRecoveredBackgroundLease(env, "automation.run");
    const result = await executeClaimedRun(run.id, workerId, env);
    if (result === "succeeded") succeeded += 1;
    else if (result === "retry") retried += 1;
    else failed += 1;
  }
  return { claimed: claimed.claims.length, failed, retried, succeeded };
}

export async function processDatabaseAutomationRun(
  env: RuntimeEnv,
  input: { runId: string; workerId: string },
) {
  if (!isDatabaseAutomationExecutionEnabled(env)) return { outcome: "noop" as const };
  try {
    const result = await drainDatabaseAutomationRuns(env, {
      limit: 1,
      runId: input.runId,
      workerId: input.workerId,
    });
    if (result.succeeded) return { outcome: "completed" as const };
    if (result.failed) return { errorCode: "AUTOMATION_RUN_FAILED", outcome: "terminal" as const };
  } catch (error) {
    if (!(error instanceof AutomationRunCapacityError)) throw error;
  }
  const [run] = await db.select({
    availableAt: databaseAutomationRun.availableAt,
    status: databaseAutomationRun.status,
  }).from(databaseAutomationRun).where(eq(databaseAutomationRun.id, input.runId)).limit(1);
  if (!run || ["succeeded", "failed", "skipped", "cancelled"].includes(run.status)) {
    return { outcome: "noop" as const };
  }
  return {
    availableAt: new Date(Math.max(run.availableAt.getTime(), Date.now() + 5_000)).toISOString(),
    outcome: "retry" as const,
  };
}
