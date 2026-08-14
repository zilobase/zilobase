import type {
  Page,
  PageDatabase,
  PageNavigationPayload,
} from "@zilobase/features/pages"

type RecentItem = {
  id: string
  kind: "database" | "page"
  lastVisitedAt?: string | null
}

export function getMostRecentItemPath(
  navigation: Pick<PageNavigationPayload, "databases" | "pages">,
) {
  const items: RecentItem[] = [
    ...navigation.pages
      .filter(isActivePage)
      .map((page) => ({
        id: page.id,
        kind: "page" as const,
        lastVisitedAt: page.lastVisitedAt,
      })),
    ...navigation.databases
      .filter(isActiveDatabase)
      .map((database) => ({
        id: database.id,
        kind: "database" as const,
        lastVisitedAt: database.lastVisitedAt,
      })),
  ]

  const mostRecent = items.reduce<RecentItem | null>((current, item) => {
    const itemTime = getTime(item.lastVisitedAt)
    if (!itemTime) return current
    return !current || itemTime > getTime(current.lastVisitedAt) ? item : current
  }, null)

  if (!mostRecent) return null
  return mostRecent.kind === "database"
    ? `/d/${encodeURIComponent(mostRecent.id)}`
    : `/p/${encodeURIComponent(mostRecent.id)}`
}

function isActivePage(page: Page) {
  return !page.deletedAt
}

function isActiveDatabase(database: PageDatabase) {
  return !database.deletedAt
}

function getTime(value: string | null | undefined) {
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}
