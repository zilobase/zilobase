export { isDesktopApp, isElectronDesktop } from "./desktop/native";

export function readBooleanFeatureFlag(value: unknown, fallback = false) {
  if (typeof value !== "string") {
    return fallback;
  }

  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      return fallback;
  }
}

export const appConfig = {
  featureFlags: {
    askAi: readBooleanFeatureFlag(import.meta.env.VITE_FEATURE_ASK_AI, true),
    notionImport: readBooleanFeatureFlag(import.meta.env.VITE_FEATURE_NOTION_IMPORT, false),
    tasks: readBooleanFeatureFlag(import.meta.env.VITE_FEATURE_TASKS, false),
    webClipper: readBooleanFeatureFlag(import.meta.env.VITE_FEATURE_WEB_CLIPPER, false),
  },
} as const;

export type FeatureFlag = keyof typeof appConfig.featureFlags;

export function isFeatureEnabled(flag: FeatureFlag) {
  return appConfig.featureFlags[flag];
}
