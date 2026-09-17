export type DatabaseMetricName =
  | "acknowledgement_latency"
  | "drag_to_paint"
  | "gap_recovery"
  | "reset"
  | "rollback"

export type DatabaseMetricReason =
  | "command_failure"
  | "event_gap"
  | "event_reset"
  | "expired_history"
  | "invalid_history"
  | "manual"

export type DatabaseMetric = {
  event: `database.${DatabaseMetricName}`
  outcome: "failure" | "success"
  reason?: DatabaseMetricReason
  value: number
}

export function databaseMetric(
  name: DatabaseMetricName,
  value: number,
  outcome: DatabaseMetric["outcome"] = "success",
  reason?: DatabaseMetricReason,
): DatabaseMetric | null {
  if (!Number.isFinite(value) || value < 0) return null
  return {
    event: `database.${name}`,
    outcome,
    ...(reason ? { reason } : {}),
    value: Math.round(value),
  }
}

export function emitDatabaseMetric(
  name: DatabaseMetricName,
  value: number,
  outcome: DatabaseMetric["outcome"] = "success",
  reason?: DatabaseMetricReason,
) {
  const metric = databaseMetric(name, value, outcome, reason)
  if (
    metric &&
    typeof window !== "undefined" &&
    typeof window.dispatchEvent === "function"
  ) {
    window.dispatchEvent(new CustomEvent("zilobase:database:metric", {
      detail: metric,
    }))
  }
  return metric
}
