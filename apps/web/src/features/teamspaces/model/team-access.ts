import type { WorkspaceRole } from "@zilobase/features/workspaces"

const DAY_IN_MS = 24 * 60 * 60 * 1000

export function localDateTimeToIso(value: string) {
  const date = new Date(value)

  if (!value || Number.isNaN(date.getTime())) {
    return null
  }

  return date.toISOString()
}

export function isoToLocalDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return ""

  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function getDefaultTemporaryExpiration(now = Date.now()) {
  return isoToLocalDateTime(new Date(now + 30 * DAY_IN_MS).toISOString())
}

export function getMinimumTemporaryExpiration(now = Date.now()) {
  return isoToLocalDateTime(new Date(now + 60_000).toISOString())
}

export function getMaximumTemporaryExpiration(now = Date.now()) {
  return isoToLocalDateTime(new Date(now + 365 * DAY_IN_MS).toISOString())
}

export function normalizeWorkspaceRole(
  value: string | null | undefined,
): WorkspaceRole | null {
  return value === "owner" ||
    value === "admin" ||
    value === "member" ||
    value === "temporary"
    ? value
    : null
}
