export type MailMetricEvent =
  | "cache_failure"
  | "cursor_reset"
  | "database_sync"
  | "index"
  | "oauth_outcome"
  | "quota_failure"
  | "socket_state"
  | "sync"
  | "watch_health"
  | "webhook_rejection"

export async function recordMailMetric(event: MailMetricEvent, input: {
  code?: string
  connectionId?: string
  count?: number
  durationMs?: number
  mode?: "full" | "incremental" | "recovery"
  outcome?: "failure" | "success"
  status?: number
} = {}) {
  const metric = {
    ...(safeCode(input.code) ? { code: input.code } : {}),
    ...(input.connectionId ? { connection: await opaqueId(input.connectionId) } : {}),
    ...(Number.isInteger(input.count) && input.count! >= 0 ? { count: input.count } : {}),
    ...(Number.isFinite(input.durationMs) ? { duration_ms: Math.max(0, Math.round(input.durationMs!)) } : {}),
    event: `mail.${event}`,
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.outcome ? { outcome: input.outcome } : {}),
    ...(Number.isInteger(input.status) ? { status: input.status } : {}),
  }
  console.info(JSON.stringify(metric))
}

async function opaqueId(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return [...new Uint8Array(digest).slice(0, 8)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function safeCode(value: string | undefined) {
  return value && /^[a-z][a-z0-9_]{0,47}$/.test(value)
}
