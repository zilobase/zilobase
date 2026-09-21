import { DEFAULT_MEETING_ITEM_ICON } from "@/features/pages/icons/item-icons";
import { getDatabaseEmoji } from "@zilobase/features/databases/appearance";
import {
  type DatabasePropertyEntity,
  type DatabaseRecordEntity,
  type DatabaseViewEntity,
  type DataSourceEntity,
  type PagePropertyValueEntity,
} from "@zilobase/features/databases";
import { databaseOrderKeyAtPosition } from "@zilobase/features/databases/order-key";
import type { DatabaseViewData } from "@/features/databases/views/model/database-controller-state";
import type { MeetingListItem } from "@zilobase/features/meetings";
import type {
  Page,
  PageDatabase,
  PageItemPlacement,
  PageNavigationPayload,
} from "@zilobase/features/pages";
import {
  libraryViewIds,
  type LibraryView,
} from "@zilobase/features/user-settings/sidebar-config";
import { libraryViewLabels } from "@/features/sidebar/model/index";
import { buildHomepageHierarchy } from "./homepage-hierarchy";

export const homepageViews = libraryViewIds.map((id) => ({
  id,
  label: libraryViewLabels[id],
}));

export type HomepageView = LibraryView;

export type RecentsMode = "home" | "trash";

export type HomepageRow = {
  createdAt: string;
  createdBy: string;
  deletedAt: string;
  deletedBy: string;
  iconKind: "database" | "page";
  id: string;
  isFavorite: boolean;
  isShared: boolean;
  itemKind: "agent" | "database" | "meeting" | "page";
  teamspaceId: string | null;
  lastVisitedAt: string | null;
  metadata: Page["metadata"] | null;
  name: string;
  openDatabaseId: string | null;
  openAgentId: string | null;
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

const homepagePropertyDefinitions = [
  { id: "source", name: "Source", type: "relation", width: 220 },
  { id: "createdBy", name: "Created by", type: "text", width: 190 },
  { id: "lastVisitedAt", name: "Last visited time", type: "date", width: 210 },
  { id: "updatedAt", name: "Last edited time", type: "date", width: 210 },
  { id: "createdAt", name: "Created time", type: "date", width: 210 },
] as const;

const trashPropertyDefinitions = [
  { id: "deletedAt", name: "Deleted at", type: "date", width: 210 },
  { id: "deletedBy", name: "Deleted by", type: "text", width: 190 },
] as const;

export function getHomepageRowType(row: HomepageRow) {
  if (row.itemKind === "agent") return "Agent";
  if (row.itemKind === "database") return "Database";
  if (row.itemKind === "meeting") return "Meeting";
  return "Page";
}

export function buildTeamspaceLibraryRows(
  rows: HomepageRow[],
  teamspaceId: string,
) {
  const matchingRows = rows.filter((row) => row.teamspaceId === teamspaceId);
  const matchingIds = new Set(matchingRows.map((row) => row.id));
  const childrenByParent = new Map<string | null, HomepageRow[]>();
  for (const row of matchingRows) {
    const parentId =
      row.parentRowId && matchingIds.has(row.parentRowId)
        ? row.parentRowId
        : null;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(row);
    childrenByParent.set(parentId, siblings);
  }
  for (const siblings of childrenByParent.values())
    siblings.sort(
      (left, right) =>
        left.position - right.position || left.name.localeCompare(right.name),
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

export function buildHomepageViewData({
  activeViewId,
  databaseConfig,
  mode,
  workspaceId,
  propertyConfigs,
  rows,
  viewConfigs,
}: {
  activeViewId: string;
  databaseConfig: unknown;
  mode: RecentsMode;
  workspaceId: string | null | undefined;
  propertyConfigs: Record<string, unknown>;
  rows: HomepageRow[];
  viewConfigs: Record<string, unknown>;
}): DatabaseViewData {
  const homepageDatabaseId = mode === "trash" ? "trash" : "homepage";
  const homepageDataSourceId = `${homepageDatabaseId}:source`;
  const propertyDefinitions =
    mode === "trash"
      ? [...homepagePropertyDefinitions, ...trashPropertyDefinitions]
      : homepagePropertyDefinitions;
  const filteredRows = applyHomepageView(rows, activeViewId as HomepageView);
  const properties: DatabasePropertyEntity[] = propertyDefinitions.map(
    (definition, index) => {
      const propertyConfig = propertyConfigs[definition.id];
      const config =
        definition.id === "source"
          ? {
              ...(isRecord(propertyConfig) ? propertyConfig : {}),
              pageSummaries: Object.fromEntries(
                rows.flatMap((row) =>
                  row.sourcePage ? [[row.sourcePage.id, row.sourcePage]] : [],
                ),
              ),
            }
          : propertyConfig;

      return {
        createdAt: "",
        dataSourceId: homepageDataSourceId,
        id: definition.id,
        position: index,
        property: {
          config,
          createdAt: "",
          id: definition.id,
          name: definition.name,
          workspaceId: workspaceId ?? "homepage",
          type: definition.type,
          updatedAt: "",
        },
        propertyId: definition.id,
        updatedAt: "",
        visible: true,
        width: definition.width,
      };
    },
  );
  const values: PagePropertyValueEntity[] = filteredRows.flatMap((row) =>
    propertyDefinitions.map((definition) => ({
      createdAt: row.createdAt,
      id: `${row.id}:${definition.id}`,
      propertyId: definition.id,
      updatedAt: row.updatedAt,
      value: row[definition.id] ?? "",
      pageId: row.id,
    })),
  );

  const valuesByPageId = new Map<string, PagePropertyValueEntity[]>()
  for (const value of values) {
    const group = valuesByPageId.get(value.pageId) ?? []
    group.push(value)
    valuesByPageId.set(value.pageId, group)
  }
  const records: DatabaseRecordEntity[] = filteredRows.map((row, index) => ({
    createdAt: row.createdAt,
    dataSourceId: homepageDataSourceId,
    id: row.id,
    orderKey: databaseOrderKeyAtPosition(index),
    page: {
      createdAt: row.createdAt,
      deletedAt: null,
      hasContent: false,
      id: row.id,
      metadata: row.metadata,
      name: row.name,
      updatedAt: row.updatedAt,
    },
    pageId: row.id,
    parentRowId: row.parentRowId,
    updatedAt: row.updatedAt,
    valuesByPropertyId: Object.fromEntries(
      (valuesByPageId.get(row.id) ?? []).map((value) => [
        value.propertyId,
        value,
      ]),
    ),
  }))

  const activeDataSource: DataSourceEntity = {
    config: databaseConfig,
    configVersion: 1,
    createdAt: "",
    id: homepageDataSourceId,
    linkedAt: null,
    name: mode === "trash" ? "Trash" : "Recents",
    parentDatabaseId: homepageDatabaseId,
    position: 0,
    updatedAt: "",
    version: 0,
    workspaceId: workspaceId ?? homepageDatabaseId,
  }

  return {
    activeDataSource,
    bootstrap: {
      database: {
        accessLevel: "full",
        config: databaseConfig,
        createdAt: "",
        deletedAt: null,
        id: homepageDatabaseId,
        name: mode === "trash" ? "Trash" : "Recents",
        workspaceId: workspaceId ?? homepageDatabaseId,
        pageId: homepageDatabaseId,
        updatedAt: "",
        version: 0,
      },
      dataSources: [activeDataSource],
      properties,
      views: homepageViews.map(
        (view, index): DatabaseViewEntity => ({
          config: viewConfigs[view.id],
          createdAt: "",
          databaseId: homepageDatabaseId,
          dataSourceId: homepageDataSourceId,
          id: view.id,
          name: view.label,
          position: index,
          type: "table",
          updatedAt: "",
        }),
      ),
    },
    dataSourceId: homepageDataSourceId,
    hasMore: false,
    records,
    totalCount: records.length,
  }
}

export function buildHomepageRows(
  navigation: PageNavigationPayload,
  meetings: MeetingListItem[],
  agents: Array<{
    id: string;
    lastVisitedAt?: string | null;
    name: string;
    ownerUserId: string;
    status: "active" | "archived";
    updatedAt: string;
  }>,
  mode: RecentsMode,
): HomepageRow[] {
  const { databases: databaseRecords, pages, placements } = navigation;
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const databases = databaseRecords.map((database) => ({
    database,
    page: database.pageId ? (pagesById.get(database.pageId) ?? null) : null,
  }));
  const showTrash = mode === "trash";
  const includePage = (page: Page) =>
    page.type !== "meeting" &&
    (showTrash ? Boolean(page.deletedAt) : !page.deletedAt);
  const includeDatabase = (database: PageDatabase, page: Page | null) =>
    showTrash
      ? Boolean(database.deletedAt ?? page?.deletedAt)
      : !database.deletedAt && !page?.deletedAt;
  const databasesById = new Map(
    databases.map(({ database, page }) => [database.id, { database, page }]),
  );
  const hierarchy = buildHomepageHierarchy(placements);
  const parentKeys = new Set(
    placements.map(
      (placement) => `${placement.parentKind}:${placement.parentId}`,
    ),
  );

  return [
    ...pages
      .filter((page) => includePage(page))
      .map((page) => {
        const sourcePage = parentKeys.has(`page:${page.id}`)
          ? null
          : resolveSourcePage(
              placements,
              pagesById,
              databasesById,
              "page",
              page.id,
            );

        return {
          ...getLibraryRowDates(page),
          iconKind: "page" as const,
          id: `page:${page.id}`,
          ...getPageRowAppearance(page),
          itemKind: "page" as const,
          openDatabaseId: null,
          openAgentId: null,
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
              placements,
              pagesById,
              databasesById,
              "database",
              database.id,
            ) ?? (page ? getPageSourcePage(page) : null));

        return {
          ...getLibraryRowDates(database, page),
          iconKind: "database" as const,
          id: `database:${database.id}`,
          ...getDatabaseRowAppearance(database, page),
          itemKind: "database" as const,
          openDatabaseId: database.id,
          openAgentId: null,
          openMeetingId: null,
          openPageId: database.pageId,
          ...getLibraryRowPlacement(hierarchy, `database:${database.id}`),
          source: sourcePage?.id ?? "",
          sourcePage,
          updatedAt: database.updatedAt,
        };
      }),
    ...(mode === "home" ? buildMeetingRows(meetings, pagesById) : []),
    ...(mode === "home"
      ? agents
          .filter((agent) => agent.status === "active")
          .map(
            (agent, index): HomepageRow => ({
              createdAt: agent.updatedAt,
              createdBy: "Workspace member",
              deletedAt: "",
              deletedBy: "",
              iconKind: "page",
              id: `agent:${agent.id}`,
              isFavorite: false,
              isShared: false,
              itemKind: "agent",
              lastVisitedAt: agent.lastVisitedAt ?? agent.updatedAt,
              metadata: { emoji: "🤖" },
              name: agent.name || "Untitled agent",
              openAgentId: agent.id,
              openDatabaseId: null,
              openMeetingId: null,
              openPageId: null,
              parentRowId: null,
              position: Number.MAX_SAFE_INTEGER - agents.length + index,
              source: "",
              sourcePage: null,
              teamspaceId: null,
              updatedAt: agent.updatedAt,
            }),
          )
      : []),
  ];
}

function buildMeetingRows(
  meetings: MeetingListItem[],
  pagesById: Map<string, Page>,
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
      metadata: { emoji: meeting.emoji ?? DEFAULT_MEETING_ITEM_ICON },
      name: meeting.title?.trim() || "Untitled meeting",
      openDatabaseId: null,
      openAgentId: null,
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
  placements: PageItemPlacement[],
  pagesById: Map<string, Page>,
  databasesById: Map<string, { database: PageDatabase; page: Page | null }>,
  itemKind: "database" | "page",
  itemId: string,
): HomepageSourcePage | null {
  const placement = placements.find(
    (candidate) =>
      candidate.itemKind === itemKind &&
      candidate.itemId === itemId &&
      (candidate.placementKind === "primary" ||
        candidate.placementKind === "database_row"),
  );

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function applyHomepageView(rows: HomepageRow[], view: HomepageView) {
  switch (view) {
    case "favourites":
      return rows.filter((row) => row.itemKind !== "meeting" && row.isFavorite);
    case "meetings":
      return rows.filter((row) => row.itemKind === "meeting");
    case "skills":
    case "instructions":
      return rows.filter(
        (row) =>
          row.itemKind === "page" &&
          row.metadata?.zilobaseai === (view === "skills" ? "skill" : "instruction"),
      );
    case "shared":
      return rows.filter(
        (row) => row.itemKind !== "meeting" && row.isShared && !row.teamspaceId,
      );
    case "teamspaces":
      return rows.filter(
        (row) => row.itemKind !== "meeting" && Boolean(row.teamspaceId),
      );
    case "private":
      return rows.filter(
        (row) =>
          row.itemKind !== "meeting" && !row.isShared && !row.teamspaceId,
      );
    case "recents":
    default:
      return rows.filter((row) => row.itemKind !== "meeting");
  }
}

function formatCreator(
  creator: Page["createdBy"] | PageDatabase["createdBy"] | undefined,
) {
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
