export const appearanceModes = [
  { colorScheme: "light", label: "Light", value: "light" },
  { colorScheme: "dark", label: "Dark", value: "dark" },
  { colorScheme: "system", label: "System", value: "system" },
] as const

export const themeFamilies = [
  { label: "Default", value: "default" },
  { label: "Notion", value: "notion" },
] as const

export type AppearanceMode = (typeof appearanceModes)[number]
export type AppearanceModeId = AppearanceMode["value"]
export type AppColorScheme = Exclude<AppearanceMode["colorScheme"], "system">
export type ThemeFamilyId = (typeof themeFamilies)[number]["value"]

export const THEME_FAMILY_STORAGE_KEY = "zilobase-theme-family"

export const selectableThemeIds = appearanceModes
  .filter((mode) => mode.value !== "system")
  .map((mode) => mode.value)

export function isThemeFamilyId(value?: string | null): value is ThemeFamilyId {
  return themeFamilies.some((family) => family.value === value)
}

export function getThemeColorScheme(theme?: string): AppColorScheme | null {
  if (!theme || theme === "system") return null

  const colorScheme = appearanceModes.find((option) => option.value === theme)?.colorScheme
  return colorScheme === "light" || colorScheme === "dark" ? colorScheme : null
}
