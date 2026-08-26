import type {
  DatabasePayload,
  DatabaseProperty,
} from "@zilobase/features/databases"

export type DatabaseSelectOption = {
  color?: string
  group?: string
  id: string
  name: string
}

export type TaskDatabaseSchema = {
  assignee: DatabaseProperty | null
  dueDate: DatabaseProperty | null
  missing: Array<"Status" | "Assignee" | "Due date">
  status: DatabaseProperty | null
}

export type TaskRow = {
  assigneeIds: string[]
  createdAt: string
  databaseId: string
  databaseName: string
  dueDate: string
  isCompleted: boolean
  pageId: string
  pageMetadata: unknown
  rowId: string
  status: string
  statusOptions: DatabaseSelectOption[]
  title: string
  updatedAt: string
}

export function getTaskDatabaseSchema(
  payload: DatabasePayload
): TaskDatabaseSchema {
  const status = findPreferredProperty(
    payload.properties,
    "status",
    /status|state/
  )
  const assignee = findPreferredProperty(
    payload.properties,
    "person",
    /assignee|assigned|owner|person/
  )
  const dueDate = findPreferredProperty(
    payload.properties,
    "date",
    /due|deadline|date/
  )
  const missing: TaskDatabaseSchema["missing"] = []

  if (!status) missing.push("Status")
  if (!assignee) missing.push("Assignee")
  if (!dueDate) missing.push("Due date")

  return { assignee, dueDate, missing, status }
}

export function buildTaskRows(payloads: DatabasePayload[]): TaskRow[] {
  return payloads.flatMap((payload) => {
    const schema = getTaskDatabaseSchema(payload)

    if (!schema.status || !schema.assignee || !schema.dueDate) return []

    const values = new Map(
      payload.values.map((value) => [
        `${value.pageId}:${value.propertyId}`,
        value.value,
      ])
    )
    const statusOptions = getSelectOptions(schema.status.property.config)

    return payload.rows.map((row) => {
      const status = readText(
        values.get(`${row.pageId}:${schema.status!.property.id}`)
      )

      return {
        assigneeIds: readPersonIds(
          values.get(`${row.pageId}:${schema.assignee!.property.id}`)
        ),
        createdAt: row.createdAt,
        databaseId: payload.database.id,
        databaseName: payload.database.name || "Untitled database",
        dueDate: readDate(
          values.get(`${row.pageId}:${schema.dueDate!.property.id}`)
        ),
        isCompleted: isTaskStatusComplete(status, statusOptions),
        pageId: row.pageId,
        pageMetadata: row.page.metadata ?? null,
        rowId: row.id,
        status,
        statusOptions,
        title: row.page.name?.trim() || "Untitled",
        updatedAt: row.updatedAt,
      }
    })
  })
}

export function filterMyTaskRows(
  rows: TaskRow[],
  currentUserId: string | null,
) {
  return rows.filter(
    (row) =>
      !row.isCompleted &&
      (!currentUserId || row.assigneeIds.includes(currentUserId)),
  )
}

export function getTaskStatusForCompletion(
  payload: DatabasePayload,
  complete: boolean
) {
  const statusProperty = getTaskDatabaseSchema(payload).status
  if (!statusProperty) return null

  const options = getSelectOptions(statusProperty.property.config)
  if (complete) {
    return options.find(isCompleteStatusOption)?.name ?? null
  }

  const defaultOptionId = readDefaultOptionId(statusProperty.property.config)
  const defaultOption = options.find((option) => option.id === defaultOptionId)
  if (defaultOption && !isCompleteStatusOption(defaultOption)) {
    return defaultOption.name
  }

  return options.find((option) => !isCompleteStatusOption(option))?.name ?? null
}

export function isTaskStatusComplete(
  status: string,
  options: DatabaseSelectOption[]
) {
  const option = options.find((candidate) => candidate.name === status)
  return option
    ? isCompleteStatusOption(option)
    : completeStatusName.test(status)
}

export function sortTaskRows(rows: TaskRow[]) {
  return [...rows].sort((left, right) => {
    if (!left.dueDate && right.dueDate) return 1
    if (left.dueDate && !right.dueDate) return -1
    if (left.dueDate !== right.dueDate) {
      return left.dueDate.localeCompare(right.dueDate)
    }
    return left.title.localeCompare(right.title, undefined, {
      sensitivity: "base",
    })
  })
}

export function getSelectOptions(config: unknown): DatabaseSelectOption[] {
  if (!config || typeof config !== "object" || !("options" in config)) return []

  const options = (config as { options?: unknown }).options

  if (!Array.isArray(options)) return []

  return options.filter(
    (option): option is DatabaseSelectOption =>
      Boolean(option) &&
      typeof option === "object" &&
      typeof (option as DatabaseSelectOption).id === "string" &&
      typeof (option as DatabaseSelectOption).name === "string"
  )
}

function findPreferredProperty(
  properties: DatabaseProperty[],
  type: string,
  preferredName: RegExp
) {
  const candidates = properties.filter(
    (property) => property.property.type === type
  )

  return (
    candidates.find((property) =>
      preferredName.test(property.property.name.trim().toLowerCase())
    ) ??
    candidates[0] ??
    null
  )
}

function readPersonIds(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value] : []
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (typeof item === "string") return item.trim() ? [item] : []
    if (!item || typeof item !== "object") return []

    const id = (item as { id?: unknown }).id
    return typeof id === "string" && id.trim() ? [id] : []
  })
}

function readDate(value: unknown) {
  if (typeof value === "string") return value.trim()
  if (Array.isArray(value)) return readText(value[0])
  if (!value || typeof value !== "object") return ""

  const date = value as { date?: unknown; start?: unknown }
  return readText(date.start ?? date.date)
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

const completeStatusName = /^(?:closed|complete|completed|done|resolved)$/i

function isCompleteStatusOption(option: DatabaseSelectOption) {
  return (
    option.group?.trim().toLowerCase() === "complete" ||
    completeStatusName.test(option.name.trim())
  )
}

function readDefaultOptionId(config: unknown) {
  if (!config || typeof config !== "object" || !("defaultOptionId" in config)) {
    return null
  }

  const defaultOptionId = (config as { defaultOptionId?: unknown })
    .defaultOptionId
  return typeof defaultOptionId === "string" ? defaultOptionId : null
}
