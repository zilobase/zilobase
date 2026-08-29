export function getSidebarDatabaseViewSearchId({
  databaseId,
  databaseViewId,
  defaultDatabaseViewId,
  isDatabaseView,
}: {
  databaseId: string | null | undefined
  databaseViewId: string | null | undefined
  defaultDatabaseViewId: string | undefined
  isDatabaseView: boolean | undefined
}) {
  if (!databaseId || !isDatabaseView || !databaseViewId) {
    return undefined
  }

  return databaseViewId === defaultDatabaseViewId
    ? undefined
    : databaseViewId
}
