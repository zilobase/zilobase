export function readBooleanFeatureFlag(value: unknown, fallback = false) {
  if (typeof value !== "string") {
    return fallback
  }

  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true
    case "0":
    case "false":
    case "no":
    case "off":
      return false
    default:
      return fallback
  }
}

export const appConfig = {
  featureFlags: {
    notionImport: readBooleanFeatureFlag(
      import.meta.env.VITE_FEATURE_NOTION_IMPORT,
      false,
    ),
  },
} as const

export type FeatureFlag = keyof typeof appConfig.featureFlags

export function isFeatureEnabled(flag: FeatureFlag) {
  return appConfig.featureFlags[flag]
}
