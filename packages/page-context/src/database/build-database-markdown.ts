import {
  getDatabaseFilters,
  getDatabaseSorts,
  getNameColumnLabel,
  getPropertyLabel,
  getPropertyTypeHint,
  getVisiblePropertiesForView,
} from "./database-view-schema"
import { formatPropertyValueForContext } from "./format-property-value"
import type { DatabaseContextPayload } from "../shared/types"

type ViewDescriptor = {
  viewName: string
  viewType: string
  schema: DatabaseContextPayload
  view: DatabaseContextPayload["views"][number]
}

type DataSourceDescriptor = {
  dataSourceId: string
  dataSourceName: string
  isExternal: boolean
  parentDatabaseId: string
  views: ViewDescriptor[]
}

export function buildDatabaseMarkdown(
  hostSchema: DatabaseContextPayload,
  dataSourceSchemas: Record<string, DatabaseContextPayload>,
): string {
  const lines: string[] = []
  const sources = collectDataSourceDescriptors(hostSchema, dataSourceSchemas)
  const descriptors = sources.flatMap((source) => source.views)

  lines.push(`#### Database: ${hostSchema.database.name}`)
  lines.push(`- Host database ID: ${hostSchema.database.id}`)
  lines.push(`- Row count: ${hostSchema.rowCount}`)
  lines.push(`- Accessible data sources: ${sources.length}`)
  lines.push("")

  for (const source of sources) {
    lines.push(
      `##### Data source: ${source.dataSourceName} (${source.isExternal ? "attached" : "native"})`,
    )
    lines.push(`- Source ID: ${source.dataSourceId}`)
    lines.push(`- Parent database ID: ${source.parentDatabaseId}`)
    lines.push(`- Views: ${source.views.length}`)

    for (const descriptor of source.views) {
      lines.push("")
      lines.push(...buildViewSection(descriptor))
      lines.push(...buildViewRowsSection(descriptor))
    }

    lines.push("")
  }

  lines.push(...buildPropertyUnion(descriptors))

  return lines.join("\n").trim()
}

function collectDataSourceDescriptors(
  hostSchema: DatabaseContextPayload,
  dataSourceSchemas: Record<string, DatabaseContextPayload>,
) {
  const descriptors: DataSourceDescriptor[] = []

  for (const source of hostSchema.dataSources) {
    const sourceSchema =
      hostSchema.activeDataSource?.id === source.id
        ? hostSchema
        : dataSourceSchemas[source.id]

    if (!sourceSchema) {
      continue
    }

    descriptors.push({
      isExternal: source.parentDatabaseId !== hostSchema.database.id,
      dataSourceId: source.id,
      dataSourceName: source.name,
      parentDatabaseId: source.parentDatabaseId,
      views: hostSchema.views
        .filter((view) => view.dataSourceId === source.id)
        .sort((left, right) => left.position - right.position)
        .map((view) => ({
          viewName: view.name,
          viewType: view.type,
          schema: sourceSchema,
          view,
        })),
    })
  }

  return descriptors
}

function buildViewSection(descriptor: ViewDescriptor) {
  const lines: string[] = []
  const activeViewConfig =
    descriptor.view.config ??
    descriptor.schema.activeDataSource?.config
  const visibleProperties = getVisiblePropertiesForView(
    descriptor.schema,
    descriptor.view,
  )
  const nameLabel = getNameColumnLabel(descriptor.schema.activeDataSource?.config)

  lines.push(
    `###### View: ${descriptor.viewName} (${descriptor.viewType})`,
  )
  lines.push(`- View ID: ${descriptor.view.id}`)

  lines.push("- Visible properties:")
  lines.push(`  - ${nameLabel} (text)`)

  for (const property of visibleProperties) {
    lines.push(`  - ${property.property.name} (${getPropertyTypeHint(property)})`)
  }

  if (
    descriptor.viewType === "kanban" ||
    descriptor.viewType === "timeline" ||
    descriptor.viewType === "gallery"
  ) {
    const groupPropertyId =
      activeViewConfig &&
      typeof activeViewConfig === "object" &&
      !Array.isArray(activeViewConfig) &&
      "groupPropertyId" in activeViewConfig
        ? (activeViewConfig as { groupPropertyId?: unknown }).groupPropertyId
        : undefined

    if (typeof groupPropertyId === "string" && groupPropertyId.length > 0) {
      lines.push(
        `- Group by: ${getPropertyLabel(descriptor.schema, groupPropertyId)}`,
      )
    }
  }

  if (descriptor.viewType === "timeline") {
    const datePropertyId =
      activeViewConfig &&
      typeof activeViewConfig === "object" &&
      !Array.isArray(activeViewConfig) &&
      "datePropertyId" in activeViewConfig
        ? (activeViewConfig as { datePropertyId?: unknown }).datePropertyId
        : undefined

    if (typeof datePropertyId === "string" && datePropertyId.length > 0) {
      lines.push(
        `- Date by: ${getPropertyLabel(descriptor.schema, datePropertyId)}`,
      )
    }
  }

  const filters = getDatabaseFilters(activeViewConfig)

  if (filters.length > 0) {
    lines.push("- Filters:")
    for (const filter of filters) {
      const propertyLabel = getPropertyLabel(descriptor.schema, filter.propertyId)
      const values = filter.values.length > 0 ? filter.values.join(", ") : "(any)"
      lines.push(`  - ${propertyLabel} ${filter.operator} ${values}`)
    }
  }

  const sorts = getDatabaseSorts(activeViewConfig)

  if (sorts.length > 0) {
    lines.push("- Sorts:")
    for (const sort of sorts) {
      const propertyLabel = getPropertyLabel(descriptor.schema, sort.column)
      lines.push(`  - ${propertyLabel} ${sort.direction}`)
    }
  }

  return lines
}

function buildViewRowsSection(descriptor: ViewDescriptor) {
  const schema = descriptor.schema
  const visibleProperties = getVisiblePropertiesForView(schema, descriptor.view)
  const nameLabel = getNameColumnLabel(schema.database.config)
  const rows = [...schema.rows].sort((left, right) => left.position - right.position)

  if (rows.length === 0) {
    return ["- Rows: (empty)"]
  }

  const headers = [
    nameLabel,
    ...visibleProperties.map((property) => property.property.name),
  ]
  const lines = [
    "- Rows (property values only; nested page body content excluded):",
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
  ]

  for (const row of rows) {
    const cells = [
      row.name,
      ...visibleProperties.map((property) => {
        const value = schema.values.find(
          (item) =>
            item.pageId === row.pageId &&
            item.propertyId === property.property.id,
        )?.value

        return (
          formatPropertyValueForContext(value, property.property.type) || "—"
        )
      }),
    ]

    lines.push(`| ${cells.map(escapeTableCell).join(" | ")} |`)
  }

  return lines
}

function escapeTableCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ")
}

function buildPropertyUnion(descriptors: ViewDescriptor[]) {
  const union = new Map<
    string,
    { label: string; typeHint: string; views: Set<string> }
  >()

  const nameLabel = getNameColumnLabel(
    descriptors[0]?.schema.activeDataSource?.config,
  )
  union.set("name", {
    label: nameLabel,
    typeHint: "text",
    views: new Set(descriptors.map((descriptor) => descriptor.viewName)),
  })

  for (const descriptor of descriptors) {
    const visibleProperties = getVisiblePropertiesForView(
      descriptor.schema,
      descriptor.view,
    )

    for (const property of visibleProperties) {
      const key = property.property.id
      const existing = union.get(key)

      if (existing) {
        existing.views.add(descriptor.viewName)
        continue
      }

      union.set(key, {
        label: property.property.name,
        typeHint: getPropertyTypeHint(property),
        views: new Set([descriptor.viewName]),
      })
    }
  }

  const lines = ["##### Properties across all views", "| Property | Type | Views |", "| --- | --- | --- |"]

  for (const entry of union.values()) {
    lines.push(
      `| ${escapeTableCell(entry.label)} | ${escapeTableCell(entry.typeHint)} | ${escapeTableCell([...entry.views].join(", "))} |`,
    )
  }

  return lines
}

export function collectRequiredDataSourceRefs(schemas: DatabaseContextPayload[]) {
  const refs = new Map<string, { dataSourceId: string; parentDatabaseId: string }>()

  for (const schema of schemas) {
    for (const view of schema.views) {
      if (view.dataSourceId === schema.activeDataSource?.id) continue
      const source = schema.dataSources.find(
        (candidate) => candidate.id === view.dataSourceId,
      )
      if (!source) continue
      refs.set(source.id, {
        dataSourceId: source.id,
        parentDatabaseId: source.parentDatabaseId,
      })
    }
  }

  return [...refs.values()]
}
