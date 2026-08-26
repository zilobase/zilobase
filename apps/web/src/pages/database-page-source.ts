import {
  getDatabaseLinkedViewKey,
  getDatabaseLinkedViews,
  type DatabaseLinkedViewConfig,
} from "@/packages/editor/extensions/database/views/database-view-config"

export type DatabasePageSource = {
  databaseId: string
  linkedView: DatabaseLinkedViewConfig | null
}

export function resolveDatabasePageSource({
  activeViewId,
  config,
  hostDatabaseId,
}: {
  activeViewId?: string | null
  config: unknown
  hostDatabaseId: string
}): DatabasePageSource {
  const linkedView = activeViewId
    ? (getDatabaseLinkedViews(config).find(
        (view) => getDatabaseLinkedViewKey(view) === activeViewId,
      ) ?? null)
    : null

  return {
    databaseId: linkedView?.databaseId ?? hostDatabaseId,
    linkedView,
  }
}
