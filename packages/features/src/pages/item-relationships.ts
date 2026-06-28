export type NavItemKind = "page" | "database"

export type ItemRef = {
  id: string
  kind: NavItemKind
}

export type EmbeddedItemsOpenAs = "dialog" | "sidepanel"

export type PageMetadata = {
  cover?: string | null
  emoji?: string | null
  embeddedItemsOpenAs?: EmbeddedItemsOpenAs | null
  fullWidth?: boolean | null
  notelabai?: "instruction" | "skill" | null
  useUserEmbeddedItemsPreference?: boolean | null
  useUserFullWidthPreference?: boolean | null
  parentItemId?: string | null
  parentItemKind?: NavItemKind | null
  linkedItems?: ItemRef[]
}

export function readMetadataRecord(metadata: unknown): PageMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {}
  }

  return metadata as PageMetadata
}

export function readParentItemId(metadata: unknown) {
  const parentItemId = readMetadataRecord(metadata).parentItemId

  return typeof parentItemId === "string" && parentItemId.length > 0
    ? parentItemId
    : null
}

export function readDatabaseParentItemId(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null
  }

  const parentItemId = (config as { parentItemId?: unknown }).parentItemId

  return typeof parentItemId === "string" && parentItemId.length > 0
    ? parentItemId
    : null
}

export function readLinkedItems(metadata: unknown): ItemRef[] {
  const linkedItems = readMetadataRecord(metadata).linkedItems

  if (!Array.isArray(linkedItems)) {
    return []
  }

  const seen = new Set<string>()

  return linkedItems.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return []
    }

    const id = item.id
    const kind = item.kind

    if (
      typeof id !== "string" ||
      id.length === 0 ||
      (kind !== "page" && kind !== "database")
    ) {
      return []
    }

    const key = `${kind}:${id}`

    if (seen.has(key)) {
      return []
    }

    seen.add(key)

    return [{ id, kind }]
  })
}

export function itemRefKey(ref: ItemRef) {
  return `${ref.kind}:${ref.id}`
}