import { getDatabaseEmoji } from "../databases/views/appearance";
import type { MeetingListItem } from "../meetings/contracts";
import type { Teamspace } from "../teamspaces/contracts";
import type {
  Page,
  PageDatabase,
  PageItemPlacement,
  PageNavigationPayload,
} from "../pages/contracts";
import { libraryViewIds, type LibraryView } from "../user-settings/sidebar-config";
import { buildHomepageHierarchy } from "./hierarchy";
export type HomepageView = LibraryView;

export type RecentsMode = "home" | "trash";

export const libraryParentPropertyId = "library-parent-item";

export type HomepageRow = {
  createdAt: string;
  createdBy: string;
  deletedAt: string;
  deletedBy: string;
  iconKind: "database" | "page";
  id: string;
  isFavorite: boolean;
  isShared: boolean;
  itemKind: "database" | "meeting" | "page" | "teamspace";
  teamspaceId: string | null;
  lastVisitedAt: string | null;
  metadata: Page["metadata"] | null;
  name: string;
  openDatabaseId: string | null;
  openMeetingId: string | null;
  openPageId: string | null;
  parentRowId: string | null;
  position: number;
  source: string;
  sourcePage: HomepageSourcePage | null;
  updatedAt: string;
};

type HomepageSourcePage = {
  iconKind: "database" | "page";
  id: string;
  metadata: Page["metadata"] | null;
  name: string;
};

export function getHomepageRowType(row: HomepageRow) {
  if (row.itemKind === "database") return "Database";
  if (row.itemKind === "meeting") return "Meeting";
  if (row.itemKind === "teamspace") return "Teamspace";
  return "Page";
}

export function buildTeamspaceLibraryRows(rows: HomepageRow[], teamspaceId: string) {
  const matchingRows = rows.filter(
    (row) => row.teamspaceId === teamspaceId && row.itemKind !== "teamspace",
  );
  const matchingIds = new Set(matchingRows.map((row) => row.id));
  const childrenByParent = new Map<string | null, HomepageRow[]>();
  for (const row of matchingRows) {
    const parentId = row.parentRowId && matchingIds.has(row.parentRowId) ? row.parentRowId : null;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(row);
    childrenByParent.set(parentId, siblings);
  }
  for (const siblings of childrenByParent.values())
    siblings.sort(
      (left, right) => left.position - right.position || left.name.localeCompare(right.name),
    );
  const result: Array<{ depth: number; row: HomepageRow }> = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const row of childrenByParent.get(parentId) ?? []) {
      result.push({ depth, row });
      visit(row.id, depth + 1);
    }
  };
  visit(null, 0);
  return result;
}

export function buildHomepageRows(
  navigation: PageNavigationPayload,
  meetings: MeetingListItem[],
  mode: RecentsMode,
  teamspaces: Teamspace[] = [],
  meetingIcon = "",
): HomepageRow[] {
  const { databases: databaseRecords, pages, placements } = navigation;
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const databases = databaseRecords.map((database) => ({
    database,
    page: database.pageId ? (pagesById.get(database.pageId) ?? null) : null,
  }));
  const showTrash = mode === "trash";
  const includePage = (page: Page) =>
    page.type !== "meeting" && (showTrash ? Boolean(page.deletedAt) : !page.deletedAt);
  const includeDatabase = (database: PageDatabase, page: Page | null) =>
    showTrash
      ? Boolean(database.deletedAt ?? page?.deletedAt)
      : !database.deletedAt && !page?.deletedAt;
  const databasesById = new Map(
    databases.map(({ database, page }) => [database.id, { database, page }]),
  );
  const hierarchy = buildHomepageHierarchy(placements);
  const parentKeys = new Set<string>();
  const sourcePlacements = new Map<string, PageItemPlacement>();
  for (const placement of placements) {
    parentKeys.add(`${placement.parentKind}:${placement.parentId}`);
    if (placement.placementKind !== "primary" && placement.placementKind !== "database_row") {
      continue;
    }
    const key = `${placement.itemKind}:${placement.itemId}`;
    if (!sourcePlacements.has(key)) sourcePlacements.set(key, placement);
  }

  const contentRows: HomepageRow[] = [
    ...pages
      .filter((page) => includePage(page))
      .map((page) => {
        const sourcePage = parentKeys.has(`page:${page.id}`)
          ? null
          : resolveSourcePage(sourcePlacements.get(`page:${page.id}`), pagesById, databasesById);

        return {
          ...getLibraryRowDates(page),
          iconKind: "page" as const,
          id: `page:${page.id}`,
          ...getPageRowAppearance(page),
          itemKind: "page" as const,
          openDatabaseId: null,
          openMeetingId: null,
          openPageId: page.id,
          ...getLibraryRowPlacement(
            hierarchy,
            `page:${page.id}`,
            page.parentPageId ? `page:${page.parentPageId}` : null,
          ),
          source: sourcePage?.id ?? "",
          sourcePage,
          updatedAt: page.updatedAt,
        };
      }),
    ...databases
      .filter(({ database, page }) => includeDatabase(database, page))
      .map(({ database, page }) => {
        const sourcePage = parentKeys.has(`database:${database.id}`)
          ? null
          : (resolveSourcePage(
              sourcePlacements.get(`database:${database.id}`),
              pagesById,
              databasesById,
            ) ?? (page ? getPageSourcePage(page) : null));

        return {
          ...getLibraryRowDates(database, page),
          iconKind: "database" as const,
          id: `database:${database.id}`,
          ...getDatabaseRowAppearance(database, page),
          itemKind: "database" as const,
          openDatabaseId: database.id,
          openMeetingId: null,
          openPageId: database.pageId,
          ...getLibraryRowPlacement(hierarchy, `database:${database.id}`),
          source: sourcePage?.id ?? "",
          sourcePage,
          updatedAt: database.updatedAt,
        };
      }),
    ...(mode === "home" ? buildMeetingRows(meetings, pagesById, meetingIcon) : []),
  ];

  if (mode === "trash") return contentRows;

  const activeTeamspaces = teamspaces.filter((teamspace) => !teamspace.archivedAt);
  const teamspaceIds = new Set(activeTeamspaces.map((teamspace) => teamspace.id));
  const contentRowsById = new Map(contentRows.map((row) => [row.id, row]));
  const nestedContentRows = contentRows.map((row) => {
    if (!row.teamspaceId || !teamspaceIds.has(row.teamspaceId)) return row;
    const parent = row.parentRowId ? contentRowsById.get(row.parentRowId) : null;
    return parent?.teamspaceId === row.teamspaceId
      ? row
      : { ...row, parentRowId: `teamspace:${row.teamspaceId}` };
  });

  return [
    ...nestedContentRows,
    ...activeTeamspaces.map((teamspace, index): HomepageRow => ({
      createdAt: teamspace.createdAt,
      createdBy: "",
      deletedAt: "",
      deletedBy: "",
      iconKind: "page",
      id: `teamspace:${teamspace.id}`,
      isFavorite: false,
      isShared: false,
      itemKind: "teamspace",
      teamspaceId: teamspace.id,
      lastVisitedAt: null,
      metadata:
        typeof teamspace.icon === "string" && teamspace.icon ? { emoji: teamspace.icon } : null,
      name: teamspace.name,
      openDatabaseId: null,
      openMeetingId: null,
      openPageId: null,
      parentRowId: null,
      position: index,
      source: "",
      sourcePage: null,
      updatedAt: teamspace.updatedAt,
    })),
  ];
}

function buildMeetingRows(
  meetings: MeetingListItem[],
  pagesById: Map<string, Page>,
  meetingIcon: string,
): HomepageRow[] {
  return meetings.map((meeting, index) => {
    const hostPage = pagesById.get(meeting.pageId) ?? null;
    const sourcePage = hostPage ? getPageSourcePage(hostPage) : null;

    return {
      createdAt: meeting.createdAt,
      createdBy: hostPage ? formatCreator(hostPage.createdBy) : "Unknown",
      deletedAt: meeting.deletedAt ?? "",
      deletedBy: "Unknown",
      iconKind: "page",
      id: `meeting:${meeting.id}`,
      isFavorite: false,
      isShared: false,
      itemKind: "meeting",
      lastVisitedAt: null,
      metadata: { emoji: meeting.emoji ?? meetingIcon },
      name: meeting.title?.trim() || "Untitled meeting",
      openDatabaseId: null,
      openMeetingId: meeting.id,
      openPageId: null,
      parentRowId: null,
      position: index,
      source: sourcePage?.id ?? "",
      sourcePage,
      teamspaceId: null,
      updatedAt: meeting.updatedAt,
    };
  });
}

export function isHomepageView(value: unknown): value is HomepageView {
  return libraryViewIds.includes(value as HomepageView);
}

function resolveSourcePage(
  placement: PageItemPlacement | undefined,
  pagesById: Map<string, Page>,
  databasesById: Map<string, { database: PageDatabase; page: Page | null }>,
): HomepageSourcePage | null {
  if (!placement) {
    return null;
  }

  if (placement.parentKind === "page") {
    const parentPage = pagesById.get(placement.parentId);

    return parentPage ? getPageSourcePage(parentPage) : null;
  }

  if (placement.parentKind === "database") {
    const parentDatabase = databasesById.get(placement.parentId)?.database;

    return parentDatabase ? getDatabaseSourcePage(parentDatabase) : null;
  }

  return null;
}

function getPageSourcePage(page: Page): HomepageSourcePage {
  return {
    iconKind: "page",
    id: `page:${page.id}`,
    metadata: page.metadata ?? null,
    name: page.name?.trim() || "Untitled",
  };
}

function getDatabaseSourcePage(database: PageDatabase): HomepageSourcePage {
  const emoji = getDatabaseEmoji({ config: database.dataSourceConfig });

  return {
    iconKind: "database",
    id: `database:${database.id}`,
    metadata: emoji ? { emoji } : null,
    name: database.name?.trim() || "Untitled",
  };
}

export function applyHomepageView(rows: HomepageRow[], view: HomepageView) {
  switch (view) {
    case "favourites":
      return rows.filter((row) => row.itemKind !== "meeting" && row.isFavorite);
    case "meetings":
      return rows.filter((row) => row.itemKind === "meeting");
    case "skills":
    case "instructions":
      return [];
    case "shared":
      return rows.filter((row) => row.itemKind !== "meeting" && row.isShared && !row.teamspaceId);
    case "teamspaces": {
      const activeTeamspaceIds = new Set(
        rows.filter((row) => row.itemKind === "teamspace").map((row) => row.teamspaceId),
      );
      return rows.filter(
        (row) =>
          row.itemKind !== "meeting" &&
          Boolean(row.teamspaceId) &&
          activeTeamspaceIds.has(row.teamspaceId),
      );
    }
    case "private":
      return rows.filter((row) => row.itemKind !== "meeting" && !row.isShared && !row.teamspaceId);
    case "trash":
      return rows.filter((row) => row.itemKind !== "meeting" && row.itemKind !== "teamspace");
    case "recents":
    default:
      return rows.filter((row) => row.itemKind !== "meeting" && row.itemKind !== "teamspace");
  }
}

export function includeHomepageDescendants(
  rows: HomepageRow[],
  selectedRows: HomepageRow[],
): HomepageRow[] {
  const childrenByParent = new Map<string, HomepageRow[]>();
  for (const row of rows) {
    if (!row.parentRowId) continue;
    const children = childrenByParent.get(row.parentRowId) ?? [];
    children.push(row);
    childrenByParent.set(row.parentRowId, children);
  }

  const selectedIds = new Set(selectedRows.map((row) => row.id));
  const pending = [...selectedIds];
  while (pending.length > 0) {
    const parentId = pending.pop()!;
    for (const child of childrenByParent.get(parentId) ?? []) {
      if (selectedIds.has(child.id)) continue;
      selectedIds.add(child.id);
      pending.push(child.id);
    }
  }

  return rows.filter((row) => selectedIds.has(row.id));
}

function formatCreator(creator: Page["createdBy"] | PageDatabase["createdBy"] | undefined) {
  return creator?.name?.trim() || creator?.email?.trim() || "Unknown";
}

function getLibraryRowDates(
  record: Pick<Page, "createdAt" | "createdBy" | "deletedAt" | "deletedBy">,
  backingPage?: Page | null,
) {
  return {
    createdAt: record.createdAt,
    createdBy: formatCreator(record.createdBy ?? backingPage?.createdBy),
    deletedAt: record.deletedAt ?? backingPage?.deletedAt ?? "",
    deletedBy: formatCreator(record.deletedBy ?? backingPage?.deletedBy),
  };
}
function getPageRowAppearance(page: Page) {
  return {
    isFavorite: Boolean(page.isFavorite),
    isShared: Boolean(page.isShared),
    teamspaceId: page.teamspaceId ?? null,
    lastVisitedAt: page.lastVisitedAt ?? null,
    metadata: page.metadata ?? null,
    name: page.name || "Untitled",
  };
}
function getDatabaseRowAppearance(database: PageDatabase, page: Page | null) {
  const emoji = getDatabaseEmoji({ config: database.dataSourceConfig });
  return {
    isFavorite: Boolean(database.isFavorite),
    isShared: Boolean(page?.isShared),
    teamspaceId: database.teamspaceId ?? page?.teamspaceId ?? null,
    lastVisitedAt: database.lastVisitedAt ?? null,
    metadata: emoji ? { emoji } : null,
    name: database.name || "Untitled",
  };
}
function getLibraryRowPlacement(
  hierarchy: ReturnType<typeof buildHomepageHierarchy>,
  rowId: string,
  fallbackParentId: string | null = null,
) {
  return {
    parentRowId: hierarchy.parentRowIdByRowId[rowId] ?? fallbackParentId,
    position: hierarchy.positionByRowId[rowId] ?? Number.MAX_SAFE_INTEGER,
  };
}

export function applyLibraryItemOrder(rows: HomepageRow[], order: string[] | undefined) {
  if (!order?.length) return rows;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered = [...new Set(order)].flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    byId.delete(id);
    return [row];
  });
  return [
    ...ordered,
    ...[...byId.values()].sort(
      (left, right) => left.position - right.position || left.name.localeCompare(right.name),
    ),
  ].map((row, position) => ({ ...row, position }));
}

export function moveLibraryItem(
  order: string[],
  move: { rowId: string; afterRowId: string | null; beforeRowId: string | null },
) {
  if (!order.includes(move.rowId)) throw new Error("The Library item is unavailable.");
  const next = order.filter((id) => id !== move.rowId);
  const before = move.beforeRowId ? next.indexOf(move.beforeRowId) : -1;
  const after = move.afterRowId ? next.indexOf(move.afterRowId) : -1;
  if ((move.beforeRowId || move.afterRowId) && before < 0 && after < 0)
    throw new Error("The Library order changed. Try again.");
  next.splice(before >= 0 ? before : after >= 0 ? after + 1 : 0, 0, move.rowId);
  return next;
}
