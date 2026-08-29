export type DatabaseFormHeaderSettings = {
  cover: string
  description: string
  icon: string
  iconPosition: "inline" | "top"
  title: string
}

export const defaultDatabaseFormHeaderSettings: DatabaseFormHeaderSettings = {
  cover: "",
  description: "",
  icon: "",
  iconPosition: "inline",
  title: "",
}

export function getDatabaseFormHeaderSettings(
  config: unknown,
): DatabaseFormHeaderSettings {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return defaultDatabaseFormHeaderSettings
  }

  const formHeader = (config as { formHeader?: unknown }).formHeader

  if (
    !formHeader ||
    typeof formHeader !== "object" ||
    Array.isArray(formHeader)
  ) {
    return defaultDatabaseFormHeaderSettings
  }

  const settings = formHeader as Record<string, unknown>

  return {
    cover: typeof settings.cover === "string" ? settings.cover : "",
    description:
      typeof settings.description === "string" ? settings.description : "",
    icon: typeof settings.icon === "string" ? settings.icon : "",
    iconPosition: settings.iconPosition === "top" ? "top" : "inline",
    title: typeof settings.title === "string" ? settings.title : "",
  }
}
