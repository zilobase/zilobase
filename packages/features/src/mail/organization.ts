import type { MailAddress, MailThreadSummary } from "./contracts"

export const mailOrganizationContractVersion = 1 as const

export const mailCustomPropertyTypes = [
  "text",
  "number",
  "select",
  "multi_select",
  "status",
  "date",
  "person",
  "checkbox",
  "url",
  "files",
] as const

export type MailCustomPropertyType = (typeof mailCustomPropertyTypes)[number]

export const mailSystemFolderIds = [
  "all_mail",
  "sent",
  "drafts",
  "spam",
  "bin",
] as const

export type MailSystemFolderId = (typeof mailSystemFolderIds)[number]

export const mailFilterOperators = [
  "is",
  "is_not",
  "contains",
  "does_not_contain",
  "starts_with",
  "ends_with",
  "greater_than",
  "greater_than_or_equal",
  "less_than",
  "less_than_or_equal",
  "is_before",
  "is_after",
  "is_on_or_before",
  "is_on_or_after",
  "is_between",
  "is_relative_to_today",
  "is_empty",
  "is_not_empty",
] as const

export type MailFilterOperator = (typeof mailFilterOperators)[number]
export type MailFilterValue = boolean | number | string | null

export type MailFilterCondition = {
  id: string
  operator: MailFilterOperator
  propertyId: string
  type: "condition"
  values: MailFilterValue[]
}

export type MailFilterGroup = {
  filters: MailFilterNode[]
  id: string
  operator: "and" | "or"
  type: "group"
}

export type MailFilterNode = MailFilterCondition | MailFilterGroup
export type MailFilterExpression = MailFilterGroup

export const maxMailFilterDepth = 3
export const maxMailFilterConditions = 50

export type MailWorkspaceConnection = {
  accountId: string
  bindingId: string
  email: string
  mailboxReady: boolean
  mailboxRevision: number
  status: "connected" | "disconnected" | "reconnect_required"
  userId: string
  watchExpiresAt: string | null
  workspaceId: string
}

export type MailPropertyOption = {
  color: string
  id: string
  name: string
}

export type MailPropertyDefinition = {
  bindingId: string
  createdAt: string
  id: string
  name: string
  options: MailPropertyOption[]
  type: MailCustomPropertyType
  updatedAt: string
}

export type MailThreadPropertyValue = {
  files?: Array<{ id: string; name: string; url: string }>
  propertyId: string
  value: MailFilterValue | MailFilterValue[]
}

export type MailSystemProperty = {
  filterable: boolean
  groupable: boolean
  id: string
  label: string
  quickFilter: boolean
  type: "address" | "boolean" | "date" | "files" | "mailbox" | "select" | "text"
}

export const mailSystemPropertyCatalog = [
  {
    id: "from",
    label: "From",
    type: "address",
    filterable: true,
    groupable: true,
    quickFilter: true,
  },
  {
    id: "to",
    label: "To",
    type: "address",
    filterable: true,
    groupable: false,
    quickFilter: true,
  },
  {
    id: "cc",
    label: "CC",
    type: "address",
    filterable: true,
    groupable: false,
    quickFilter: true,
  },
  {
    id: "bcc",
    label: "BCC",
    type: "address",
    filterable: true,
    groupable: false,
    quickFilter: true,
  },
  {
    id: "subject",
    label: "Subject",
    type: "text",
    filterable: true,
    groupable: false,
    quickFilter: true,
  },
  {
    id: "body",
    label: "Body",
    type: "text",
    filterable: true,
    groupable: false,
    quickFilter: false,
  },
  {
    id: "date",
    label: "Date",
    type: "date",
    filterable: true,
    groupable: true,
    quickFilter: true,
  },
  {
    id: "received_date",
    label: "Received date",
    type: "date",
    filterable: true,
    groupable: true,
    quickFilter: true,
  },
  {
    id: "attachments",
    label: "Files",
    type: "files",
    filterable: true,
    groupable: false,
    quickFilter: true,
  },
  {
    id: "calendar_event",
    label: "Calendar event",
    type: "boolean",
    filterable: true,
    groupable: false,
    quickFilter: true,
  },
  {
    id: "unread",
    label: "Unread",
    type: "boolean",
    filterable: true,
    groupable: true,
    quickFilter: true,
  },
  {
    id: "sent",
    label: "Sent",
    type: "boolean",
    filterable: true,
    groupable: false,
    quickFilter: true,
  },
  {
    id: "archived",
    label: "Archived",
    type: "boolean",
    filterable: true,
    groupable: false,
    quickFilter: true,
  },
  {
    id: "starred",
    label: "Starred",
    type: "boolean",
    filterable: true,
    groupable: true,
    quickFilter: false,
  },
  {
    id: "important",
    label: "Important",
    type: "boolean",
    filterable: true,
    groupable: true,
    quickFilter: false,
  },
  {
    id: "labels",
    label: "Labels",
    type: "select",
    filterable: true,
    groupable: true,
    quickFilter: true,
  },
  {
    id: "categories",
    label: "Categories",
    type: "select",
    filterable: true,
    groupable: true,
    quickFilter: true,
  },
  {
    id: "priority",
    label: "Priority",
    type: "select",
    filterable: true,
    groupable: true,
    quickFilter: true,
  },
  {
    id: "mailbox",
    label: "Mailbox",
    type: "mailbox",
    filterable: true,
    groupable: false,
    quickFilter: false,
  },
  {
    id: "email_domain",
    label: "Email domain",
    type: "address",
    filterable: true,
    groupable: true,
    quickFilter: false,
  },
] as const satisfies readonly MailSystemProperty[]

export type MailQuickFilterDefinition = {
  defaultOperator: MailFilterOperator
  defaultValues: MailFilterValue[]
  id: string
  label: string
  propertyId: string
}

export const mailQuickFilterCatalog = [
  {
    id: "from",
    label: "From",
    propertyId: "from",
    defaultOperator: "contains",
    defaultValues: [""],
  },
  {
    id: "has_attachments",
    label: "Has attachments",
    propertyId: "attachments",
    defaultOperator: "is_not_empty",
    defaultValues: [],
  },
  {
    id: "date",
    label: "Date",
    propertyId: "date",
    defaultOperator: "is_relative_to_today",
    defaultValues: ["past_week"],
  },
  {
    id: "calendar_only",
    label: "Only show calendar events",
    propertyId: "calendar_event",
    defaultOperator: "is",
    defaultValues: [true],
  },
  {
    id: "show_social",
    label: "Show “Social” emails",
    propertyId: "categories",
    defaultOperator: "is",
    defaultValues: ["social"],
  },
  {
    id: "show_promotions",
    label: "Show “Promotions” emails",
    propertyId: "categories",
    defaultOperator: "is",
    defaultValues: ["promotions"],
  },
  {
    id: "labels",
    label: "Labels",
    propertyId: "labels",
    defaultOperator: "is",
    defaultValues: [],
  },
  {
    id: "categories",
    label: "Categories",
    propertyId: "categories",
    defaultOperator: "is",
    defaultValues: [],
  },
  {
    id: "priority",
    label: "Priority",
    propertyId: "priority",
    defaultOperator: "is",
    defaultValues: [],
  },
  {
    id: "bcc",
    label: "BCC",
    propertyId: "bcc",
    defaultOperator: "contains",
    defaultValues: [""],
  },
  {
    id: "to",
    label: "To",
    propertyId: "to",
    defaultOperator: "contains",
    defaultValues: [""],
  },
  {
    id: "cc",
    label: "CC",
    propertyId: "cc",
    defaultOperator: "contains",
    defaultValues: [""],
  },
  {
    id: "subject",
    label: "Subject",
    propertyId: "subject",
    defaultOperator: "contains",
    defaultValues: [""],
  },
  {
    id: "received_date",
    label: "Received date",
    propertyId: "received_date",
    defaultOperator: "is_relative_to_today",
    defaultValues: ["past_week"],
  },
  {
    id: "show_sent",
    label: "Show sent",
    propertyId: "sent",
    defaultOperator: "is",
    defaultValues: [true],
  },
  {
    id: "hide_archived",
    label: "Hide archived",
    propertyId: "archived",
    defaultOperator: "is",
    defaultValues: [false],
  },
  {
    id: "is_read",
    label: "Is read",
    propertyId: "unread",
    defaultOperator: "is",
    defaultValues: [false],
  },
  {
    id: "is_unread",
    label: "Is unread",
    propertyId: "unread",
    defaultOperator: "is",
    defaultValues: [true],
  },
  {
    id: "no_attachments",
    label: "No attachments",
    propertyId: "attachments",
    defaultOperator: "is_empty",
    defaultValues: [],
  },
  {
    id: "hide_calendar",
    label: "Hide calendar events",
    propertyId: "calendar_event",
    defaultOperator: "is",
    defaultValues: [false],
  },
  {
    id: "show_primary",
    label: "Show “Primary” emails",
    propertyId: "categories",
    defaultOperator: "is",
    defaultValues: ["primary"],
  },
  {
    id: "hide_primary",
    label: "Hide “Primary” emails",
    propertyId: "categories",
    defaultOperator: "is_not",
    defaultValues: ["primary"],
  },
  {
    id: "hide_social",
    label: "Hide “Social” emails",
    propertyId: "categories",
    defaultOperator: "is_not",
    defaultValues: ["social"],
  },
  {
    id: "hide_promotions",
    label: "Hide “Promotions” emails",
    propertyId: "categories",
    defaultOperator: "is_not",
    defaultValues: ["promotions"],
  },
  {
    id: "show_updates",
    label: "Show “Updates” emails",
    propertyId: "categories",
    defaultOperator: "is",
    defaultValues: ["updates"],
  },
  {
    id: "hide_updates",
    label: "Hide “Updates” emails",
    propertyId: "categories",
    defaultOperator: "is_not",
    defaultValues: ["updates"],
  },
  {
    id: "show_forums",
    label: "Show “Forums” emails",
    propertyId: "categories",
    defaultOperator: "is",
    defaultValues: ["forums"],
  },
  {
    id: "hide_forums",
    label: "Hide “Forums” emails",
    propertyId: "categories",
    defaultOperator: "is_not",
    defaultValues: ["forums"],
  },
] as const satisfies readonly MailQuickFilterDefinition[]

export type MailGroupConfig = {
  direction: "ascending" | "descending"
  hideEmptyGroups: boolean
  propertyId: string
}

export type MailHoverActionKind =
  | "star"
  | "archive"
  | "bin"
  | "read_unread"
  | "remind"
  | "command"
  | "any_label"
  | "spam"
  | "reply"
  | "specific_label"
  | "unsubscribe"

export type MailHoverAction = {
  effect?: "archive" | "bin" | "none"
  hidden: boolean
  icon?: "bookmark" | "heart" | "star" | "tag"
  id: string
  kind: MailHoverActionKind
  labelId?: string
}

export const defaultMailHoverActions: readonly MailHoverAction[] = [
  { id: "star", kind: "star", hidden: false },
  { id: "archive", kind: "archive", hidden: false },
  { id: "bin", kind: "bin", hidden: false },
  { id: "read-unread", kind: "read_unread", hidden: false },
  { id: "remind", kind: "remind", hidden: false },
]

export type MailDatabaseFieldMapping = {
  destinationPropertyId: string
  sourcePropertyId: string
}

export type MailDatabaseSyncConfig = {
  activatedAt: string | null
  destinationDataSourceId: string | null
  destinationDatabaseId: string | null
  enabled: boolean
  mappings: MailDatabaseFieldMapping[]
  workspaceId: string | null
}

export type MailViewConfig = {
  databaseSync: MailDatabaseSyncConfig
  filter: MailFilterExpression
  group: MailGroupConfig | null
  hiddenPropertyIds: string[]
  hoverActions: MailHoverAction[]
  propertyOrder: string[]
}

export type MailPersistedView = {
  bindingId: string
  config: MailViewConfig
  createdAt: string
  icon: string | null
  id: string
  name: string
  position: number
  protected: boolean
  templateId: MailViewTemplateId | null
  updatedAt: string
}

export type MailViewsBootstrap = {
  index?: MailIndexProgress
  systemFolders: readonly MailSystemFolderId[]
  views: MailPersistedView[]
}

export type MailViewCreateInput = {
  config?: MailViewConfig
  icon?: string | null
  name?: string
  templateId?: MailViewTemplateId
}

export type MailViewUpdateInput = {
  config?: MailViewConfig
  icon?: string | null
  name?: string
}

export type MailViewReorderInput = {
  viewIds: string[]
}

export type MailIndexStatus =
  | "pending"
  | "backfilling"
  | "syncing"
  | "ready"
  | "error"

export type MailIndexProgress = {
  completedAt: string | null
  indexedThreadCount: number
  lastErrorCode: string | null
  resultSizeEstimate: number | null
  status: MailIndexStatus
}

export type MailIndexedThread = {
  bcc: MailAddress[]
  cc: MailAddress[]
  from: MailAddress[]
  hasCalendarEvent: boolean
  important: boolean
  thread: MailThreadSummary
  to: MailAddress[]
}

export type MailQueryGroup = {
  count: number
  cursor: string
  key: string
  label: string
  mutable: boolean
}

export type MailViewGroupsResponse = {
  group: MailGroupConfig | null
  groups: MailQueryGroup[]
  index: MailIndexProgress
}

export type MailViewQueryResponse = {
  index: MailIndexProgress
  nextCursor: string | null
  searchTruncated: boolean
  threads: MailIndexedThread[]
}

const emptyFilter = (id = "root"): MailFilterExpression => ({
  filters: [],
  id,
  operator: "and",
  type: "group",
})

const emptyDatabaseSync = (): MailDatabaseSyncConfig => ({
  activatedAt: null,
  destinationDataSourceId: null,
  destinationDatabaseId: null,
  enabled: false,
  mappings: [],
  workspaceId: null,
})

function condition(
  id: string,
  propertyId: string,
  operator: MailFilterOperator,
  values: MailFilterValue[],
): MailFilterCondition {
  return { id, operator, propertyId, type: "condition", values }
}

export const mailViewTemplateIds = [
  "inbox",
  "unread",
  "starred",
  "important",
  "attachments",
  "promotions",
  "social",
] as const

export type MailViewTemplateId = (typeof mailViewTemplateIds)[number]

export type MailViewTemplate = {
  config: MailViewConfig
  icon: string
  id: MailViewTemplateId
  name: string
  protected: boolean
}

function createTemplateConfig(filters: MailFilterCondition[]): MailViewConfig {
  return {
    databaseSync: emptyDatabaseSync(),
    filter: { ...emptyFilter(), filters },
    group: null,
    hiddenPropertyIds: [],
    hoverActions: defaultMailHoverActions.map((action) => ({ ...action })),
    propertyOrder: ["from", "subject", "labels", "received_date"],
  }
}

export const mailViewTemplates = [
  {
    id: "inbox",
    name: "Inbox",
    icon: "inbox",
    protected: true,
    config: createTemplateConfig([
      condition("inbox", "mailbox", "is", ["inbox"]),
    ]),
  },
  {
    id: "unread",
    name: "Unread",
    icon: "mail",
    protected: false,
    config: createTemplateConfig([condition("unread", "unread", "is", [true])]),
  },
  {
    id: "starred",
    name: "Starred",
    icon: "star",
    protected: false,
    config: createTemplateConfig([
      condition("starred", "starred", "is", [true]),
    ]),
  },
  {
    id: "important",
    name: "Important",
    icon: "circle-alert",
    protected: false,
    config: createTemplateConfig([
      condition("important", "important", "is", [true]),
    ]),
  },
  {
    id: "attachments",
    name: "Attachments",
    icon: "paperclip",
    protected: false,
    config: createTemplateConfig([
      condition("attachments", "attachments", "is_not_empty", []),
    ]),
  },
  {
    id: "promotions",
    name: "Promotions",
    icon: "shopping-bag",
    protected: false,
    config: createTemplateConfig([
      condition("promotions", "categories", "is", ["promotions"]),
    ]),
  },
  {
    id: "social",
    name: "Social",
    icon: "message-circle",
    protected: false,
    config: createTemplateConfig([
      condition("social", "categories", "is", ["social"]),
    ]),
  },
] as const satisfies readonly MailViewTemplate[]

const filterOperatorSet = new Set<string>(mailFilterOperators)
const hoverActionKindSet = new Set<string>([
  "star",
  "archive",
  "bin",
  "read_unread",
  "remind",
  "command",
  "any_label",
  "spam",
  "reply",
  "specific_label",
  "unsubscribe",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback
}

function normalizeFilterValue(value: unknown): MailFilterValue | undefined {
  return value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? value
    : undefined
}

export function normalizeMailFilterExpression(
  value: unknown,
): MailFilterExpression {
  let conditionCount = 0
  let generatedId = 0

  const normalizeNode = (
    node: unknown,
    depth: number,
  ): MailFilterNode | null => {
    if (!isRecord(node)) return null

    if (node.type === "condition") {
      if (conditionCount >= maxMailFilterConditions) return null
      const propertyId = stringValue(node.propertyId, "")
      if (
        !propertyId ||
        typeof node.operator !== "string" ||
        !filterOperatorSet.has(node.operator)
      )
        return null
      conditionCount += 1
      const values = Array.isArray(node.values)
        ? node.values
            .map(normalizeFilterValue)
            .filter((item): item is MailFilterValue => item !== undefined)
        : []
      return {
        id: stringValue(node.id, `condition-${generatedId++}`),
        operator: node.operator as MailFilterOperator,
        propertyId,
        type: "condition",
        values,
      }
    }

    if (node.type !== "group" || depth >= maxMailFilterDepth) return null
    const filters = Array.isArray(node.filters)
      ? node.filters
          .map((child) => normalizeNode(child, depth + 1))
          .filter((child): child is MailFilterNode => child !== null)
      : []
    return {
      filters,
      id: stringValue(node.id, `group-${generatedId++}`),
      operator: node.operator === "or" ? "or" : "and",
      type: "group",
    }
  }

  const normalized = normalizeNode(value, 0)
  return normalized?.type === "group" ? normalized : emptyFilter()
}

export function normalizeMailViewConfig(value: unknown): MailViewConfig {
  const record = isRecord(value) ? value : {}
  const databaseSync = isRecord(record.databaseSync) ? record.databaseSync : {}
  const group =
    isRecord(record.group) &&
    typeof record.group.propertyId === "string" &&
    record.group.propertyId
      ? {
          direction:
            record.group.direction === "ascending"
              ? ("ascending" as const)
              : ("descending" as const),
          hideEmptyGroups: record.group.hideEmptyGroups === true,
          propertyId: record.group.propertyId,
        }
      : null

  const hoverActions = Array.isArray(record.hoverActions)
    ? record.hoverActions.flatMap((item, index): MailHoverAction[] => {
        if (
          !isRecord(item) ||
          typeof item.kind !== "string" ||
          !hoverActionKindSet.has(item.kind)
        )
          return []
        const effect =
          item.effect === "archive" ||
          item.effect === "bin" ||
          item.effect === "none"
            ? item.effect
            : undefined
        const icon =
          item.icon === "bookmark" ||
          item.icon === "heart" ||
          item.icon === "star" ||
          item.icon === "tag"
            ? item.icon
            : undefined
        return [
          {
            effect,
            hidden: item.hidden === true,
            icon,
            id: stringValue(item.id, `action-${index}`),
            kind: item.kind as MailHoverActionKind,
            labelId:
              typeof item.labelId === "string" ? item.labelId : undefined,
          },
        ]
      })
    : defaultMailHoverActions.map((action) => ({ ...action }))

  const mappings = Array.isArray(databaseSync.mappings)
    ? databaseSync.mappings.flatMap((mapping): MailDatabaseFieldMapping[] => {
        if (
          !isRecord(mapping) ||
          typeof mapping.sourcePropertyId !== "string" ||
          typeof mapping.destinationPropertyId !== "string"
        )
          return []
        return [
          {
            sourcePropertyId: mapping.sourcePropertyId,
            destinationPropertyId: mapping.destinationPropertyId,
          },
        ]
      })
    : []

  return {
    databaseSync: {
      activatedAt:
        typeof databaseSync.activatedAt === "string"
          ? databaseSync.activatedAt
          : null,
      destinationDataSourceId:
        typeof databaseSync.destinationDataSourceId === "string"
          ? databaseSync.destinationDataSourceId
          : null,
      destinationDatabaseId:
        typeof databaseSync.destinationDatabaseId === "string"
          ? databaseSync.destinationDatabaseId
          : null,
      enabled: databaseSync.enabled === true,
      mappings,
      workspaceId:
        typeof databaseSync.workspaceId === "string"
          ? databaseSync.workspaceId
          : null,
    },
    filter: normalizeMailFilterExpression(record.filter),
    group,
    hiddenPropertyIds: Array.isArray(record.hiddenPropertyIds)
      ? record.hiddenPropertyIds.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    hoverActions,
    propertyOrder: Array.isArray(record.propertyOrder)
      ? record.propertyOrder.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
  }
}

export function createMailViewFromTemplate(templateId: MailViewTemplateId) {
  const template = mailViewTemplates.find((item) => item.id === templateId)
  if (!template) throw new Error(`Unknown mail view template: ${templateId}`)
  return {
    icon: template.icon,
    name: template.name,
    protected: template.protected,
    templateId: template.id,
    config: normalizeMailViewConfig(template.config),
  }
}
