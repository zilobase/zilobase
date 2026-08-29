import { invoke, isTauri } from "@tauri-apps/api/core"

type DiagnosticLevel = "error" | "info" | "warn"
type DiagnosticValue = boolean | number | string | null | undefined
type DiagnosticFields = Record<string, DiagnosticValue>

const startupStartedAt = now()
const safeNumericFields = new Set([
  "duration_ms",
  "elapsed_ms",
  "http_status",
])
const safeBooleanFields = new Set([
  "offline_supported",
  "owner_present",
  "session_present",
  "token_present",
  "user_present",
  "value_present",
])
const safeStatusValues = new Set([
  "complete",
  "disabled",
  "error",
  "missing",
  "started",
  "success",
  "timeout",
])
const safePlatformValues = new Set(["linux", "macos", "windows", "unknown"])

let installed = false
let appReady = false
let startupTimer: number | undefined

export function installDesktopDiagnostics() {
  if (installed || typeof window === "undefined" || !isTauri()) return
  installed = true

  recordDesktopDiagnostic("renderer.started", {
    elapsed_ms: desktopStartupElapsedMs(),
    platform: desktopPlatform(),
    status: "success",
  })

  window.addEventListener("error", (event) => {
    recordDesktopDiagnostic(
      "renderer.uncaught_error",
      describeDesktopError(event.error),
      "error",
    )
  })
  window.addEventListener("unhandledrejection", (event) => {
    recordDesktopDiagnostic(
      "renderer.unhandled_rejection",
      describeDesktopError(event.reason),
      "error",
    )
  })

  startupTimer = window.setTimeout(() => {
    if (appReady) return
    recordDesktopDiagnostic(
      "renderer.startup_timeout",
      { elapsed_ms: desktopStartupElapsedMs(), status: "timeout" },
      "warn",
    )
  }, 15_000)
}

export function markDesktopRootMounted() {
  recordDesktopDiagnostic("renderer.root_mounted", {
    elapsed_ms: desktopStartupElapsedMs(),
    status: "success",
  })
}

export function markDesktopAppReady() {
  if (appReady || !isTauri()) return
  appReady = true
  window.clearTimeout(startupTimer)
  const elapsedMs = desktopStartupElapsedMs()
  recordDesktopDiagnostic("renderer.app_ready", {
    elapsed_ms: elapsedMs,
    status: "success",
  })
  void invoke("mark_renderer_ready", { elapsedMs }).catch(() => {
    recordDesktopDiagnostic(
      "renderer.ready_signal",
      { error_type: "InvokeError", status: "error" },
      "error",
    )
  })
}

export function desktopStartupElapsedMs() {
  return Math.max(0, Math.round(now() - startupStartedAt))
}

export function describeDesktopError(error: unknown): DiagnosticFields {
  const errorType =
    error instanceof Error
      ? error.name
      : typeof error === "object" && error && "name" in error
        ? String(error.name)
        : "UnknownError"
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : undefined

  return {
    error_type: errorType,
    ...(status === undefined ? {} : { http_status: status }),
    status: "error",
  }
}

export function recordDesktopDiagnostic(
  event: string,
  fields: DiagnosticFields = {},
  level: DiagnosticLevel = "info",
) {
  if (!isTauri()) return
  if (!formatDesktopDiagnostic(event, fields)) return

  void invoke("record_renderer_diagnostic", { event, fields, level }).catch(
    () => undefined,
  )
}

export function formatDesktopDiagnostic(
  event: string,
  fields: DiagnosticFields = {},
) {
  if (!/^[a-z][a-z0-9_.-]{0,63}$/.test(event)) return null

  const serializedFields = Object.entries(fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, value]) => {
      const safe = safeDiagnosticField(key, value)
      return safe === null ? [] : [`${key}=${safe}`]
    })

  return [`[diagnostics] event=${event}`, ...serializedFields].join(" ")
}

function safeDiagnosticField(key: string, value: DiagnosticValue) {
  if (value === null || value === undefined) return null
  if (safeNumericFields.has(key)) {
    return typeof value === "number" && Number.isFinite(value)
      ? String(Math.max(0, Math.round(value)))
      : null
  }
  if (safeBooleanFields.has(key)) {
    return typeof value === "boolean" ? String(value) : null
  }
  if (key === "status") {
    return typeof value === "string" && safeStatusValues.has(value) ? value : null
  }
  if (key === "platform") {
    return typeof value === "string" && safePlatformValues.has(value) ? value : null
  }
  if (key === "error_type" || key === "value_kind") {
    return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(value)
      ? value
      : null
  }
  return null
}

function desktopPlatform() {
  const userAgent = navigator.userAgent
  if (userAgent.includes("Linux")) return "linux"
  if (userAgent.includes("Mac")) return "macos"
  if (userAgent.includes("Windows")) return "windows"
  return "unknown"
}

function now() {
  return typeof performance === "undefined" ? Date.now() : performance.now()
}
