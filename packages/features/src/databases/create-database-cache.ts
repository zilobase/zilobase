import type { DatabasePayload } from "./queries"
import { applyNavDelta, type NavDelta } from "../pages/nav-delta"
import type {
  PageDatabase,
  PageItemPlacement,
  PageNavigationPayload,
} from "../pages/queries"

function toPageDatabase(payload: DatabasePayload): PageDatabase {
  return {
    ...payload.database,
    views: payload.views,
  }
}

function getPrimaryDatabasePlacement(
  payload: DatabasePayload,
): PageItemPlacement | null {
  const parentItemId = payload.database.pageId

  if (!parentItemId) {
    return null
  }

  return {
    id: `primary:page:${parentItemId}:database:${payload.database.id}`,
    itemId: payload.database.id,
    itemKind: "database",
    workspaceId: payload.database.workspaceId,
    parentId: parentItemId,
    parentKind: "page",
    placementKind: "primary",
    position: 0,
    sourceRowId: null,
  }
}

export function getCreatedDatabaseNavDelta(payload: DatabasePayload): NavDelta {
  const database = toPageDatabase(payload)
  const placement = getPrimaryDatabasePlacement(payload)

  return {
    upsertDatabases: [database],
    upsertPlacements: placement ? [placement] : [],
  }
}

export function applyCreatedDatabaseToPageNav(
  navigation: PageNavigationPayload | undefined,
  payload: DatabasePayload,
) {
  return applyNavDelta(navigation, getCreatedDatabaseNavDelta(payload))
}
