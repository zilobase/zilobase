export function getSidebarDatabaseViewSearchId({
  databaseId,
  databaseViewId,
  defaultDatabaseViewId,
  isDatabaseView,
}: {
  databaseId: string | null | undefined;
  databaseViewId: string | null | undefined;
  defaultDatabaseViewId: string | undefined;
  isDatabaseView: boolean | undefined;
}) {
  if (!databaseId || !isDatabaseView || !databaseViewId) {
    return undefined;
  }

  return databaseViewId === defaultDatabaseViewId ? undefined : databaseViewId;
}

/** Copy/open links use the owning database when present, otherwise the page. */
export function getNavigationItemPath({
  databaseId,
  pageId,
}: {
  databaseId?: string | null;
  pageId?: string | null;
}) {
  return databaseId ? `/d/${databaseId}` : `/p/${pageId}`;
}
