import {
  getDatabaseFilters,
  getDatabaseLinkedViews,
  getDatabaseSorts,
  getNameColumnLabel,
  getPropertyLabel,
  getPropertyTypeHint,
  getVisiblePropertiesForView,
} from "./database-view-schema"
import { formatPropertyValueForContext } from "./format-property-value"
import type { DatabaseContextPayload } from "./types"

type ViewDescriptor = {
  viewName: string
  viewType: string
  isLinked: boolean
  linkedViewId?: string
  sourceDatabaseId?: string
  sourceDatabaseName?: string
  sourceViewId?: string
  schema: DatabaseContextPayload
  view: DatabaseContextPayload["views"][number]
}

export function buildDatabaseMarkdown(
  hostSchema: DatabaseContextPayload,
  linkedSourceSchemas: Record<string, DatabaseContextPayload>,
): string {
  const lines: string[] = []
  const descriptors = collectViewDescriptors(hostSchema, linkedSourceSchemas)

  lines.push(`#### Database: ${hostSchema.database.name}`)
  lines.push(`- ID: ${hostSchema.database.id}`)
  lines.push(`- Row count: ${hostSchema.rowCount}`)
  lines.push("")

  for (const descriptor of descriptors) {
    lines.push(...buildViewSection(descriptor, hostSchema))
    lines.push(...buildViewRowsSection(descriptor))
    lines.push("")
  }

  lines.push(...buildPropertyUnion(descriptors, hostSchema))

  return lines.join("\n").trim()
}

function collectViewDescriptors(
  hostSchema: DatabaseContextPayload,
  linkedSourceSchemas: Record<string, DatabaseContextPayload>,
) {
  const descriptors: ViewDescriptor[] = []

  for (const view of [...hostSchema.views].sort(
    (left, right) => left.position - right.position,
  )) {
    descriptors.push({
      viewName: view.name,
      viewType: view.type,
      isLinked: false,
      schema: hostSchema,
      view,
    })
  }

  for (const linkedView of getDatabaseLinkedViews(hostSchema.database.config)) {
    const sourceSchema = linkedSourceSchemas[linkedView.databaseId]

    if (!sourceSchema) {
      descriptors.push({
        viewName: linkedView.viewName,
        viewType: linkedView.viewType,
        isLinked: true,
        linkedViewId: linkedView.linkedViewId,
        sourceDatabaseId: linkedView.databaseId,
        sourceDatabaseName: linkedView.databaseName,
        sourceViewId: linkedView.viewId,
        schema: hostSchema,
        view: {
          id: linkedView.viewId,
          type: linkedView.viewType,
          name: linkedView.viewName,
          position: Number.MAX_SAFE_INTEGER,
        },
      })
      continue
    }

    const sourceView =
      sourceSchema.views.find((view) => view.id === linkedView.viewId) ?? {
        id: linkedView.viewId,
        type: linkedView.viewType,
        name: linkedView.viewName,
        config: undefined,
        position: Number.MAX_SAFE_INTEGER,
      }

    descriptors.push({
      viewName: linkedView.viewName,
      viewType: linkedView.viewType,
      isLinked: true,
      linkedViewId: linkedView.linkedViewId,
      sourceDatabaseId: linkedView.databaseId,
      sourceDatabaseName: linkedView.databaseName,
      sourceViewId: linkedView.viewId,
      schema: sourceSchema,
      view: sourceView,
    })
  }

  return descriptors
}

function buildViewSection(
  descriptor: ViewDescriptor,
  hostSchema: DatabaseContextPayload,
) {
  const lines: string[] = []
  const activeViewConfig =
    descriptor.view.config ??
    (descriptor.isLinked ? descriptor.schema.database.config : hostSchema.database.config)
  const visibleProperties = getVisiblePropertiesForView(
    descriptor.schema,
    descriptor.view,
  )
  const nameLabel = getNameColumnLabel(descriptor.schema.database.config)

  lines.push(
    `##### View: ${descriptor.viewName} (${descriptor.isLinked ? "linked" : "native"}, ${descriptor.viewType})`,
  )

  if (descriptor.isLinked) {
    if (descriptor.sourceDatabaseName || descriptor.sourceDatabaseId) {
      const sourceLabel = descriptor.sourceDatabaseName ?? "Untitled database"
      const sourceId = descriptor.sourceDatabaseId
        ? ` (id: ${descriptor.sourceDatabaseId})`
        : ""
      lines.push(`- Linked source database: ${sourceLabel}${sourceId}`)
    }

    if (descriptor.sourceViewId) {
      lines.push(`- Linked source view ID: ${descriptor.sourceViewId}`)
    }

    if (descriptor.linkedViewId) {
      lines.push(`- Linked view tab ID: ${descriptor.linkedViewId}`)
    }
  }

  lines.push("- Visible properties:")
  lines.push(`  - ${nameLabel} (text)`)

  for (const property of visibleProperties) {
    lines.push(`  - ${property.property.name} (${getPropertyTypeHint(property)})`)
  }

  if (descriptor.viewType === "kanban" || descriptor.viewType === "timeline") {
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

function buildPropertyUnion(
  descriptors: ViewDescriptor[],
  hostSchema: DatabaseContextPayload,
) {
  const union = new Map<
    string,
    { label: string; typeHint: string; views: Set<string> }
  >()

  const nameLabel = getNameColumnLabel(hostSchema.database.config)
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
      `| ${entry.label} | ${entry.typeHint} | ${[...entry.views].join(", ")} |`,
    )
  }

  return lines
}

export function collectRequiredLinkedDatabaseIds(
  schemas: DatabaseContextPayload[],
): string[] {
  const ids = new Set<string>()

  for (const schema of schemas) {
    for (const linkedView of getDatabaseLinkedViews(schema.database.config)) {
      if (linkedView.databaseId !== schema.database.id) {
        ids.add(linkedView.databaseId)
      }
    }
  }

  return [...ids]
}