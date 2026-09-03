import {
  mailSystemFolderIds,
  type MailFilterExpression,
  type MailGroupConfig,
  type MailLabelRecord,
  type MailPersistedView,
  type MailPropertyDefinition,
  type MailQueryGroup,
  type MailThreadPropertyValue,
  type MailThreadSummary,
  type MailView,
} from "@zilobase/features/mail"

const messageGroups = ["Today", "Yesterday", "Earlier"] as const

export function isMutableMailGroup(propertyId: string) {
  return !["date", "received_date", "from", "email_domain"].includes(propertyId)
}

export function providerViewForOrganizationRoute(
  view: MailPersistedView | null,
  folder: (typeof mailSystemFolderIds)[number] | null,
): MailView {
  if (folder) return folder
  if (
    view?.templateId === "inbox" ||
    view?.templateId === "starred" ||
    view?.templateId === "unread"
  ) {
    return view.templateId
  }
  return "inbox"
}

export function countMailFilterConditions(filter: MailFilterExpression, hideImplicitInbox = false): number {
  return filter.filters.reduce(
    (count, node) => count + (node.type === "condition"
      ? hideImplicitInbox && node.propertyId === "mailbox" && node.operator === "is" && node.values.length === 1 && node.values[0] === "inbox" ? 0 : 1
      : countMailFilterConditions(node, hideImplicitInbox)),
    0,
  )
}

export function groupMailThreads(
  threads: MailThreadSummary[],
  group: MailGroupConfig | null,
  labels: MailLabelRecord[],
  serverGroups: MailQueryGroup[],
  customProperties: MailPropertyDefinition[],
  customValuesByThread: Map<string, Record<string, MailThreadPropertyValue["value"]>>,
) {
  if (!group) return messageGroups
    .map((label) => ({
      count: threads.filter((thread) => dateGroup(thread.internalDate) === label).length,
      key: label.toLowerCase(),
      label,
      mutable: false,
      threads: threads.filter((thread) => dateGroup(thread.internalDate) === label),
    }))
    .filter((entry) => entry.threads.length > 0)

  const buckets = new Map<string, MailThreadSummary[]>()
  for (const thread of threads) {
    for (const key of clientGroupKeys(thread, group.propertyId, customValuesByThread.get(thread.id))) {
      buckets.set(key, [...buckets.get(key) ?? [], thread])
    }
  }
  const descriptors = serverGroups.length
    ? serverGroups
    : [...buckets.keys()].map((key) => ({
      count: buckets.get(key)?.length ?? 0,
      cursor: "",
      key,
      label: clientGroupLabel(key, group.propertyId, labels, customProperties),
      mutable: isMutableMailGroup(group.propertyId),
    }))
  const hideEmptyGroups = group.propertyId === "starred" ? false : group.hideEmptyGroups

  return descriptors
    .filter((descriptor) => !hideEmptyGroups || descriptor.count > 0)
    .sort((left, right) => group.propertyId === "starred"
      ? Number(right.key === "true") - Number(left.key === "true")
      : 0)
    .map((descriptor) => ({
      ...descriptor,
      label: clientGroupLabel(descriptor.key, group.propertyId, labels, customProperties, descriptor.label),
      threads: group.direction === "ascending"
        ? [...buckets.get(descriptor.key) ?? []].reverse()
        : buckets.get(descriptor.key) ?? [],
    }))
}

export type MailThreadGroup = ReturnType<typeof groupMailThreads>[number]

function clientGroupKeys(thread: MailThreadSummary, propertyId: string, customValues?: Record<string, MailThreadPropertyValue["value"]>): string[] {
  if (propertyId === "date" || propertyId === "received_date") return [dateGroup(thread.internalDate).toLowerCase()]
  if (propertyId === "starred") return [String(thread.starred)]
  if (propertyId === "unread") return [String(thread.unread)]
  if (propertyId === "important" || propertyId === "priority") return [String(thread.labelIds.includes("IMPORTANT"))]
  if (propertyId === "labels") return thread.labelIds.length ? thread.labelIds : ["empty"]
  const address = thread.participants[0]?.address ?? ""
  if (propertyId === "from") return [address.toLowerCase() || "empty"]
  if (propertyId === "email_domain") return [address.split("@")[1]?.toLowerCase() || "empty"]
  const customValue = customValues?.[propertyId]
  if (Array.isArray(customValue)) {
    const keys = customValue.map((item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean" ? String(item) : "").filter(Boolean)
    return keys.length ? keys : ["empty"]
  }
  return customValue === null || customValue === undefined || customValue === "" ? ["empty"] : [String(customValue)]
}

function clientGroupLabel(key: string, propertyId: string, labels: MailLabelRecord[], customProperties: MailPropertyDefinition[], fallback?: string) {
  if (propertyId === "labels") return labels.find((label) => label.id === key)?.name ?? (key === "empty" ? "No label" : fallback ?? key)
  if (propertyId === "starred") return key === "true" ? "Starred" : "Everything else"
  if (propertyId === "unread") return key === "true" ? "Unread" : "Read"
  if (propertyId === "important" || propertyId === "priority") return key === "true" ? "Important" : "Not important"
  const customProperty = customProperties.find((property) => property.id === propertyId)
  if (customProperty) return customProperty.options.find((option) => option.id === key)?.name ?? fallback ?? (key === "empty" ? `No ${customProperty.name}` : key)
  return fallback ?? (key === "empty" ? "Empty" : key)
}

export function orderedVisibleCustomProperties(view: MailPersistedView, properties: MailPropertyDefinition[]) {
  const byId = new Map(properties.map((property) => [property.id, property]))
  const ordered = view.config.propertyOrder.map((id) => byId.get(id)).filter((property): property is MailPropertyDefinition => Boolean(property))
  return [...ordered, ...properties.filter((property) => !view.config.propertyOrder.includes(property.id))]
    .filter((property) => !view.config.hiddenPropertyIds.includes(property.id))
}

function dateGroup(timestamp: number): (typeof messageGroups)[number] {
  const date = new Date(timestamp)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return "Today"
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  return date.toDateString() === yesterday.toDateString() ? "Yesterday" : "Earlier"
}

export function formatThreadDate(timestamp: number) {
  const date = new Date(timestamp)
  return dateGroup(timestamp) === "Today"
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { day: "numeric", month: "short" })
}

export function formatMessageDate(timestamp: number) {
  return new Date(timestamp).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
