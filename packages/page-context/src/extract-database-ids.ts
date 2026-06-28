export function extractDatabaseIds(content: unknown): string[] {
  const ids = new Set<string>()
  walkContent(content, ids)
  return [...ids]
}

function walkContent(node: unknown, ids: Set<string>) {
  if (!node || typeof node !== "object") {
    return
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      walkContent(item, ids)
    }
    return
  }

  const record = node as {
    attrs?: { databaseId?: unknown }
    content?: unknown
    type?: unknown
  }

  if (
    record.type === "databaseBlock" &&
    typeof record.attrs?.databaseId === "string" &&
    record.attrs.databaseId.length > 0
  ) {
    ids.add(record.attrs.databaseId)
  }

  walkContent(record.content, ids)
}