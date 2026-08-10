export type DatabaseFormFillAccess = "workspace" | "public" | "closed"

export type DatabaseFormSubmissionAccess =
  | "none"
  | "view"
  | "comment"
  | "edit"
  | "full"

export type DatabaseFormShareSettings = {
  anonymousResponses: boolean
  fillAccess: DatabaseFormFillAccess
  submissionAccess: DatabaseFormSubmissionAccess
}

export const defaultDatabaseFormShareSettings: DatabaseFormShareSettings = {
  anonymousResponses: true,
  fillAccess: "workspace",
  submissionAccess: "none",
}

export function getDatabaseFormShareSettings(
  config: unknown,
): DatabaseFormShareSettings {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return defaultDatabaseFormShareSettings
  }

  const formShare = (config as { formShare?: unknown }).formShare

  if (!formShare || typeof formShare !== "object" || Array.isArray(formShare)) {
    return defaultDatabaseFormShareSettings
  }

  const settings = formShare as Record<string, unknown>

  return {
    anonymousResponses: settings.anonymousResponses !== false,
    fillAccess: isDatabaseFormFillAccess(settings.fillAccess)
      ? settings.fillAccess
      : defaultDatabaseFormShareSettings.fillAccess,
    submissionAccess: isDatabaseFormSubmissionAccess(
      settings.submissionAccess,
    )
      ? settings.submissionAccess
      : defaultDatabaseFormShareSettings.submissionAccess,
  }
}

function isDatabaseFormFillAccess(
  value: unknown,
): value is DatabaseFormFillAccess {
  return value === "workspace" || value === "public" || value === "closed"
}

function isDatabaseFormSubmissionAccess(
  value: unknown,
): value is DatabaseFormSubmissionAccess {
  return ["none", "view", "comment", "edit", "full"].includes(
    value as string,
  )
}
