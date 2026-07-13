export type PageLayoutScope = "workspace" | "database" | "page"

export type PageLayoutStructure = "simple" | "tabbed"

export type PageLayoutRegion = "main" | "panel"

export type PageLayoutPropertyDisplay =
  | "always"
  | "hide_when_empty"
  | "hidden"

export type PageLayoutModuleType =
  | "heading"
  | "property_group"
  | "property"
  | "discussions"
  | "content"

export type PageLayoutModule = {
  id: string
  type: PageLayoutModuleType
  region: PageLayoutRegion
  propertyId?: string
}

export type PageLayoutLinkedTab = {
  id: string
  databaseId: string
  databaseName: string
  viewId: string
  viewName: string
  viewType: string
}

export type PageLayoutPropertySettings = {
  display: PageLayoutPropertyDisplay
  section?: string
}

export type PageLayoutConfig = {
  version: 1
  structure: PageLayoutStructure
  modules: PageLayoutModule[]
  linkedTabs: PageLayoutLinkedTab[]
  pinnedPropertyIds: string[]
  propertyOrder: string[]
  propertySettings: Record<string, PageLayoutPropertySettings>
  propertyIcons: boolean
  discussionsVisible: boolean
  fullWidth?: boolean
}

export type ResolvedPageLayout = {
  config: PageLayoutConfig
  databaseId: string | null
  pageId: string | null
  sources: Partial<Record<"generic" | "schema", PageLayoutScope>>
  workspaceId: string
}

export type PageLayoutTarget = {
  databaseId?: string | null
  pageId?: string | null
}

export type PageLayoutModuleDestination = {
  beforeModuleId?: string
  region: PageLayoutRegion
}

export const PAGE_LAYOUT_CONTENT_TAB_ID = "content"

export function canMovePageLayoutModuleToRegion(
  module: PageLayoutModule,
  region: PageLayoutRegion,
) {
  if (region === "main") return true
  return module.type === "property" || module.type === "property_group"
}

function stabilizePageLayoutModules(modules: PageLayoutModule[]) {
  const placedModules = modules.map((module) =>
    canMovePageLayoutModuleToRegion(module, module.region)
      ? module
      : { ...module, region: "main" as const },
  )
  const heading = placedModules.find((module) => module.type === "heading")
  const propertyGroup = placedModules.find(
    (module) => module.type === "property_group",
  )
  const stabilized = placedModules.filter(
    (module) =>
      (module.type !== "heading" || module.id === heading?.id) &&
      (module.type !== "property_group" || module.id === propertyGroup?.id),
  )

  if (heading) {
    const headingIndex = stabilized.findIndex(
      (module) => module.id === heading.id,
    )
    stabilized.splice(headingIndex, 1)
    stabilized.unshift({ ...heading, region: "main" })
  }

  if (propertyGroup?.region === "main") {
    const propertyGroupIndex = stabilized.findIndex(
      (module) => module.id === propertyGroup.id,
    )
    stabilized.splice(propertyGroupIndex, 1)
    stabilized.splice(heading ? 1 : 0, 0, propertyGroup)
  }

  return stabilized
}

export function movePageLayoutModule(
  config: PageLayoutConfig,
  moduleId: string,
  destination: PageLayoutModuleDestination,
): PageLayoutConfig {
  const module = config.modules.find((item) => item.id === moduleId)

  if (
    !module ||
    module.type === "heading" ||
    !canMovePageLayoutModuleToRegion(module, destination.region) ||
    destination.beforeModuleId === moduleId
  ) {
    return config
  }

  const modules = config.modules.filter((item) => item.id !== moduleId)
  const movedModule = { ...module, region: destination.region }
  const beforeIndex = destination.beforeModuleId
    ? modules.findIndex((item) => item.id === destination.beforeModuleId)
    : -1

  if (beforeIndex >= 0) {
    modules.splice(beforeIndex, 0, movedModule)
  } else {
    let lastRegionIndex = -1
    for (let index = modules.length - 1; index >= 0; index -= 1) {
      if (modules[index]?.region === destination.region) {
        lastRegionIndex = index
        break
      }
    }
    modules.splice(
      lastRegionIndex < 0 ? modules.length : lastRegionIndex + 1,
      0,
      movedModule,
    )
  }

  const stabilizedModules = stabilizePageLayoutModules(modules)

  const unchanged = config.modules.every(
    (item, index) =>
      item.id === stabilizedModules[index]?.id &&
      item.region === stabilizedModules[index]?.region,
  )

  return unchanged ? config : { ...config, modules: stabilizedModules }
}

export function createDefaultPageLayout(
  options: { database?: boolean; fullWidth?: boolean } = {},
): PageLayoutConfig {
  return {
    version: 1,
    structure: "simple",
    modules: [
      { id: "heading", type: "heading", region: "main" },
      ...(options.database
        ? [{ id: "property-group", type: "property_group" as const, region: "main" as const }]
        : []),
      { id: "discussions", type: "discussions", region: "main" },
      { id: "content", type: "content", region: "main" },
    ],
    linkedTabs: [],
    pinnedPropertyIds: [],
    propertyOrder: [],
    propertySettings: {},
    propertyIcons: true,
    discussionsVisible: true,
    ...(options.fullWidth === undefined ? {} : { fullWidth: options.fullWidth }),
  }
}

const moduleTypes = new Set<PageLayoutModuleType>([
  "heading",
  "property_group",
  "property",
  "discussions",
  "content",
])

const displayModes = new Set<PageLayoutPropertyDisplay>([
  "always",
  "hide_when_empty",
  "hidden",
])

export function normalizePageLayoutConfig(
  value: unknown,
  options: { database?: boolean } = {},
): PageLayoutConfig {
  const fallback = createDefaultPageLayout(options)

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback
  }

  const input = value as Partial<PageLayoutConfig>
  const seenIds = new Set<string>()
  const modules = Array.isArray(input.modules)
    ? input.modules.flatMap((module) => {
        if (
          !module ||
          typeof module !== "object" ||
          typeof module.id !== "string" ||
          seenIds.has(module.id) ||
          !moduleTypes.has(module.type) ||
          (module.region !== "main" && module.region !== "panel") ||
          (module.type === "property" && typeof module.propertyId !== "string")
        ) {
          return []
        }

        seenIds.add(module.id)
        return [{
          id: module.id,
          type: module.type,
          region: module.region,
          ...(module.propertyId ? { propertyId: module.propertyId } : {}),
        }]
      })
    : []

  for (const required of fallback.modules.filter(
    (module) => module.type === "heading" || module.type === "content" || module.type === "property_group",
  )) {
    if (!modules.some((module) => module.type === required.type)) {
      modules.push(required)
    }
  }

  const normalizedModules = stabilizePageLayoutModules(modules)

  const propertySettings = Object.fromEntries(
    Object.entries(input.propertySettings ?? {}).flatMap(([propertyId, setting]) => {
      if (!setting || !displayModes.has(setting.display)) return []
      return [[propertyId, {
        display: setting.display,
        ...(typeof setting.section === "string" && setting.section.trim()
          ? { section: setting.section.trim() }
          : {}),
      }]]
    }),
  )

  return {
    version: 1,
    structure: input.structure === "tabbed" ? "tabbed" : "simple",
    modules: normalizedModules,
    linkedTabs: Array.isArray(input.linkedTabs)
      ? input.linkedTabs.flatMap((tab) =>
          tab &&
          typeof tab.id === "string" &&
          typeof tab.databaseId === "string" &&
          typeof tab.viewId === "string"
            ? [{
                id: tab.id,
                databaseId: tab.databaseId,
                databaseName: typeof tab.databaseName === "string" ? tab.databaseName : "Untitled database",
                viewId: tab.viewId,
                viewName: typeof tab.viewName === "string" ? tab.viewName : "Untitled view",
                viewType: typeof tab.viewType === "string" ? tab.viewType : "table",
              }]
            : [],
        )
      : [],
    pinnedPropertyIds: Array.isArray(input.pinnedPropertyIds)
      ? [...new Set(input.pinnedPropertyIds.filter((id): id is string => typeof id === "string"))]
      : [],
    propertyOrder: Array.isArray(input.propertyOrder)
      ? [...new Set(input.propertyOrder.filter((id): id is string => typeof id === "string"))]
      : [],
    propertySettings,
    propertyIcons: input.propertyIcons !== false,
    discussionsVisible: input.discussionsVisible !== false,
    ...(typeof input.fullWidth === "boolean" ? { fullWidth: input.fullWidth } : {}),
  }
}

export function toWorkspacePageLayout(config: PageLayoutConfig): PageLayoutConfig {
  return normalizePageLayoutConfig({
    ...config,
    linkedTabs: [],
    pinnedPropertyIds: [],
    propertyOrder: [],
    propertySettings: {},
    modules: config.modules.filter(
      (module) => module.type !== "property" && module.type !== "property_group",
    ),
  })
}
