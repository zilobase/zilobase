import type {
  Page,
  PageDatabase,
  PageItemPlacement,
} from "@zilobase/features/pages"

export type BreadcrumbNavigationItem =
  | { id: string; kind: "page"; page: Page }
  | { database: PageDatabase; id: string; kind: "database" }

export type BreadcrumbNavigationSection =
  | { kind: "private"; label: "Private" }
  | { kind: "shared"; label: "Shared" }
  | { kind: "teamspace"; label: string; teamspaceId: string }

export function buildCanonicalBreadcrumbTrail(
  item: { id: string; kind: "page" | "database" },
  pages: Page[],
  databases: PageDatabase[],
  placements: PageItemPlacement[],
) {
  const pagesById = new Map(pages.map((page) => [page.id, page]))
  const databasesById = new Map(databases.map((database) => [database.id, database]))
  const trail: BreadcrumbNavigationItem[] = []
  const visited = new Set<string>()
  let current: typeof item | undefined = item

  while (current) {
    const visitKey = `${current.kind}:${current.id}`
    if (visited.has(visitKey)) break
    visited.add(visitKey)

    if (current.kind === "page") {
      const page = pagesById.get(current.id)
      if (!page) break
      trail.unshift({ id: page.id, kind: "page", page })
    } else {
      const database = databasesById.get(current.id)
      if (!database) break
      trail.unshift({ database, id: database.id, kind: "database" })
    }

    const placement = getCanonicalPlacement(placements, current)
    current = placement
      ? { id: placement.parentId, kind: placement.parentKind }
      : undefined
  }

  return trail
}

export function getBreadcrumbNavigationSection(
  trail: BreadcrumbNavigationItem[],
  teamspaceNames: ReadonlyMap<string, string>,
): BreadcrumbNavigationSection {
  const root = trail[0]
  const teamspaceId = root?.kind === "page"
    ? root.page.teamspaceId
    : root?.database.teamspaceId

  if (teamspaceId) {
    return {
      kind: "teamspace",
      label: teamspaceNames.get(teamspaceId)?.trim() || "Teamspace",
      teamspaceId,
    }
  }

  const isShared = root?.kind === "page" && Boolean(root.page.isShared)
  return isShared
    ? { kind: "shared", label: "Shared" }
    : { kind: "private", label: "Private" }
}

function getCanonicalPlacement(
  placements: PageItemPlacement[],
  item: { id: string; kind: "page" | "database" },
) {
  const candidates = placements.filter(
    (placement) =>
      placement.itemKind === item.kind &&
      placement.itemId === item.id &&
      placement.placementKind !== "linked",
  )

  return candidates.find((placement) => placement.placementKind === "primary")
    ?? candidates.find((placement) => placement.placementKind === "database_row")
}
