import { DATABASE_PAGE_DRAG_MIME } from "../core/database-contracts"

export type DatabasePageDragPayload = {
  databaseId?: string
  pageId: string
  rowId?: string
  title?: string
}

export function getDatabasePageDragPayload(
  dataTransfer: DataTransfer | null
): DatabasePageDragPayload | null {
  const payload = dataTransfer?.getData(DATABASE_PAGE_DRAG_MIME)

  if (!payload) {
    return null
  }

  try {
    const parsed = JSON.parse(payload) as {
      databaseId?: unknown
      pageId?: unknown
      rowId?: unknown
      title?: unknown
    }

    if (typeof parsed.pageId !== "string" || !parsed.pageId) {
      return null
    }

    return {
      databaseId:
        typeof parsed.databaseId === "string" ? parsed.databaseId : undefined,
      pageId: parsed.pageId,
      rowId: typeof parsed.rowId === "string" ? parsed.rowId : undefined,
      title: typeof parsed.title === "string" ? parsed.title : undefined,
    }
  } catch {
    return null
  }
}

export function hasDatabasePageDragPayload(dataTransfer: DataTransfer | null) {
  return Array.from(dataTransfer?.types ?? []).includes(DATABASE_PAGE_DRAG_MIME)
}
