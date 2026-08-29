import { DATABASE_PAGE_DRAG_MIME } from "../core/database-contracts"
import {
  hasDragType,
  readDragPayload,
  writeDragPayload,
} from "@/shared/lib/drag-drop"

export type DatabasePageDragPayload = {
  databaseId?: string
  pageId: string
  rowId?: string
  title?: string
}

function isDatabasePageDragPayload(
  value: unknown,
): value is DatabasePageDragPayload {
  if (typeof value !== "object" || value === null) return false

  const payload = value as Record<string, unknown>
  return typeof payload.pageId === "string" && payload.pageId.length > 0
}

export function getDatabasePageDragPayload(
  dataTransfer: DataTransfer | null
): DatabasePageDragPayload | null {
  const payload = readDragPayload(
    dataTransfer,
    DATABASE_PAGE_DRAG_MIME,
    isDatabasePageDragPayload,
  )
  if (!payload) return null

  return {
    databaseId:
      typeof payload.databaseId === "string" ? payload.databaseId : undefined,
    pageId: payload.pageId,
    rowId: typeof payload.rowId === "string" ? payload.rowId : undefined,
    title: typeof payload.title === "string" ? payload.title : undefined,
  }
}

export function hasDatabasePageDragPayload(dataTransfer: DataTransfer | null) {
  return hasDragType(dataTransfer, DATABASE_PAGE_DRAG_MIME)
}

export function setDatabasePageDragPayload(
  dataTransfer: DataTransfer,
  payload: DatabasePageDragPayload,
) {
  dataTransfer.effectAllowed = "copyMove"
  writeDragPayload(dataTransfer, DATABASE_PAGE_DRAG_MIME, payload)
  if (payload.title !== undefined) {
    dataTransfer.setData("text/plain", payload.title)
  }
}
