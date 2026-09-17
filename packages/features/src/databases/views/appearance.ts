import type { DatabaseRecord } from  "../core/legacy-contracts";

export function isDatabaseLocked(
  database: Pick<DatabaseRecord, "config"> | null | undefined,
) {
  if (
    !database?.config ||
    typeof database.config !== "object" ||
    Array.isArray(database.config)
  ) {
    return false
  }

  return (database.config as { locked?: unknown }).locked === true
}

export function getDatabaseEmoji(database: { config?: unknown }) {
  const config = database.config

  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config)
  ) {
    return null
  }

  const emoji = (config as { emoji?: unknown }).emoji

  return typeof emoji === "string" && emoji.length > 0 ? emoji : null
}

export function getDatabaseCover(database: Pick<DatabaseRecord, "config">) {
  if (
    !database.config ||
    typeof database.config !== "object" ||
    Array.isArray(database.config)
  ) {
    return null
  }

  const cover = (database.config as { cover?: unknown }).cover

  return typeof cover === "string" && cover.length > 0 ? cover : null
}
