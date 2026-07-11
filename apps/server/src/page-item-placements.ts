import { and, eq, isNull } from "drizzle-orm";
import { pageItemPlacement } from "./db/schema";
export type NavItemKind = "page" | "database";

export type ItemRef = {
  id: string;
  kind: NavItemKind;
};

export type PagePlacementKind = "primary" | "linked" | "database_row";

export type PageItemPlacementPayload = {
  id: string;
  workspaceId: string;
  parentKind: NavItemKind;
  parentId: string;
  itemKind: NavItemKind;
  itemId: string;
  placementKind: PagePlacementKind;
  sourceRowId?: string | null;
  position: number;
};

type PlacementRecord = {
  deletedAt?: Date | null;
  id: string;
  workspaceId: string;
  parentKind: string;
  parentId: string;
  itemKind: string;
  itemId: string;
  placementKind: string;
  sourceRowId?: string | null;
  position: number;
};

type PlacementExecutor = {
  insert: (table: typeof pageItemPlacement) => any;
  update: (table: typeof pageItemPlacement) => any;
};

export function buildNavigationPlacements({
  placementRecords,
}: {
  placementRecords: PlacementRecord[];
}): PageItemPlacementPayload[] {
  const placements = new Map<string, PageItemPlacementPayload>();

  for (const placement of placementRecords) {
    if (placement.deletedAt) {
      continue;
    }

    if (
      isNavItemKind(placement.parentKind) &&
      isNavItemKind(placement.itemKind) &&
      isPlacementKind(placement.placementKind)
    ) {
      addPlacement(placements, {
        ...placement,
        parentKind: placement.parentKind,
        itemKind: placement.itemKind,
        placementKind: placement.placementKind,
      });
    }
  }

  return [...placements.values()].sort((first, second) => {
    if (first.position !== second.position) {
      return first.position - second.position;
    }

    return first.id.localeCompare(second.id);
  });
}

export async function upsertPageItemPlacement(
  tx: PlacementExecutor,
  input: Omit<PageItemPlacementPayload, "id" | "position"> & {
    id?: string;
    position?: number;
  },
) {
  const now = new Date();

  await tx
    .insert(pageItemPlacement)
    .values({
      id: input.id ?? crypto.randomUUID(),
      workspaceId: input.workspaceId,
      parentKind: input.parentKind,
      parentId: input.parentId,
      itemKind: input.itemKind,
      itemId: input.itemId,
      placementKind: input.placementKind,
      sourceRowId: input.sourceRowId ?? null,
      position: input.position ?? 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}

export async function softDeletePageItemPlacement(
  tx: PlacementExecutor,
  input: {
    item: ItemRef;
    workspaceId: string;
    parentId: string;
    parentKind: NavItemKind;
  },
) {
  await tx
    .update(pageItemPlacement)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(pageItemPlacement.workspaceId, input.workspaceId),
        eq(pageItemPlacement.parentKind, input.parentKind),
        eq(pageItemPlacement.parentId, input.parentId),
        eq(pageItemPlacement.itemKind, input.item.kind),
        eq(pageItemPlacement.itemId, input.item.id),
        isNull(pageItemPlacement.deletedAt),
      ),
    );
}

function addPlacement(
  placements: Map<string, PageItemPlacementPayload>,
  placement: PageItemPlacementPayload,
) {
  const key = [
    placement.parentKind,
    placement.parentId,
    placement.itemKind,
    placement.itemId,
    placement.placementKind,
    placement.sourceRowId ?? "",
  ].join(":");

  if (!placements.has(key)) {
    placements.set(key, placement);
  }
}

function isNavItemKind(value: string): value is NavItemKind {
  return value === "page" || value === "database";
}

function isPlacementKind(value: string): value is PagePlacementKind {
  return value === "primary" || value === "linked" || value === "database_row";
}
