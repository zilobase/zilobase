import type { PageItemPlacement } from "@zilobase/features/pages"

export type HomepageHierarchy = {
  parentRowIdByRowId: Record<string, string>
  positionByRowId: Record<string, number>
}

export function buildHomepageHierarchy(
  placements: PageItemPlacement[],
): HomepageHierarchy {
  const canonicalPlacements = [...placements]
    .filter(
      (placement) =>
        placement.itemKind !== placement.parentKind ||
        placement.itemId !== placement.parentId,
    )
    .sort(
      (left, right) =>
        getPlacementPriority(left) - getPlacementPriority(right) ||
        left.position - right.position ||
        left.id.localeCompare(right.id),
    )
  const parentRowIdByRowId: Record<string, string> = {}
  const positionByRowId: Record<string, number> = {}

  for (const placement of canonicalPlacements) {
    const rowId = getPlacementRowId(placement.itemKind, placement.itemId)

    if (parentRowIdByRowId[rowId]) continue

    parentRowIdByRowId[rowId] = getPlacementRowId(
      placement.parentKind,
      placement.parentId,
    )
    positionByRowId[rowId] = placement.position
  }

  return { parentRowIdByRowId, positionByRowId }
}

function getPlacementPriority(placement: PageItemPlacement) {
  if (placement.placementKind === "primary") return 0
  if (placement.placementKind === "database_row") return 1
  return 2
}

function getPlacementRowId(kind: "database" | "page", id: string) {
  return `${kind}:${id}`
}
