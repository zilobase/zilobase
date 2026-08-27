import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import {
  canAccessDatabaseInWorkspace,
  getAccessiblePageIds,
  getMembership,
} from "../../access";
import { db } from "../../db";
import { database, page } from "../../db/schema";
import { PageGraph } from "../../page-graph";

export type WorkspaceSearchResult = {
  emoji: string | null;
  excerpt: string | null;
  id: string;
  path: string;
  title: string;
  type: "database" | "page";
  updatedAt: Date;
};

const DEFAULT_MAX_SEARCH_RESULTS = 50;
const MAX_SEARCH_RESULTS = 100;
const MAX_SEARCH_EXCERPT_CHARS = 280;

export async function searchWorkspaceItems(input: {
  limit?: number;
  membershipVerified?: boolean;
  query: string;
  types?: Array<WorkspaceSearchResult["type"]>;
  userId: string;
  workspaceId: string;
}) {
  if (
    !input.membershipVerified &&
    !(await getMembership(input.workspaceId, input.userId))
  ) {
    return [];
  }

  const query = normalizeSearchQuery(input.query);
  const requestedTypes = new Set(input.types ?? ["page", "database"]);
  const limit = Math.max(
    1,
    Math.min(input.limit ?? DEFAULT_MAX_SEARCH_RESULTS, MAX_SEARCH_RESULTS),
  );
  const accessibleIds = await getAccessiblePageIds(
    input.workspaceId,
    input.userId,
    { membershipVerified: true },
  );

  const [pageRecords, databaseRecords] = await Promise.all([
    db
      .select({
        content: page.content,
        id: page.id,
        metadata: page.metadata,
        name: page.name,
        updatedAt: page.updatedAt,
      })
      .from(page)
      .where(
        and(
          eq(page.workspaceId, input.workspaceId),
          inArray(page.id, [...accessibleIds]),
          isNull(page.deletedAt),
        ),
      )
      .orderBy(asc(page.name)),
    db
      .select({
        config: database.config,
        id: database.id,
        name: database.name,
        pageId: database.pageId,
        updatedAt: database.updatedAt,
      })
      .from(database)
      .where(
        and(
          eq(database.workspaceId, input.workspaceId),
          isNull(database.deletedAt),
        ),
      )
      .orderBy(asc(database.name)),
  ]);
  const visibleDatabaseRecords = requestedTypes.has("database")
    ? (
        await Promise.all(
          databaseRecords.map(async (record) => ({
            record,
            visible: await canAccessDatabaseInWorkspace(
              record.id,
              input.workspaceId,
              input.userId,
              "view",
            ),
          })),
        )
      )
        .filter(({ visible }) => visible)
        .map(({ record }) => record)
    : [];
  const pageById = new Map(
    pageRecords.map((record) => [record.id, record]),
  );
  const pageGraph = new PageGraph({ pages: pageRecords });
  const results: WorkspaceSearchResult[] = [];

  if (requestedTypes.has("page")) {
    for (const record of pageRecords) {
      const title = getTitle(record.name, "Untitled");
      const path = pageGraph.getPagePath(record, (value) =>
        getTitle(value, "Untitled"),
      );
      const contentText = extractContentText(record.content);

      if (matchesQuery(query, [title, path, contentText])) {
        results.push({
          emoji: readEmoji(record.metadata),
          excerpt: buildSearchExcerpt(contentText, query),
          id: record.id,
          path,
          title,
          type: "page",
          updatedAt: record.updatedAt,
        });
      }
    }
  }

  for (const record of visibleDatabaseRecords) {
    const parentPage = record.pageId ? pageById.get(record.pageId) : null;

    if (record.pageId && !parentPage) {
      continue;
    }

    const title = getTitle(record.name, "Database");
    const parentPath = parentPage
      ? pageGraph.getPagePath(parentPage, (value) =>
          getTitle(value, "Untitled"),
        )
      : "";
    const path = parentPath ? `${parentPath} / ${title}` : title;

    if (matchesQuery(query, [title, path])) {
      results.push({
        emoji: readEmoji(record.config),
        excerpt: null,
        id: record.id,
        path,
        title,
        type: "database",
        updatedAt: record.updatedAt,
      });
    }
  }

  return rankResults(results, query).slice(0, limit);
}

export function normalizeSearchQuery(query: string) {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function extractContentText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!content || typeof content !== "object") {
    return "";
  }

  if (Array.isArray(content)) {
    return content.map(extractContentText).filter(Boolean).join(" ");
  }

  const node = content as { content?: unknown; text?: unknown };
  const ownText = typeof node.text === "string" ? node.text : "";
  const childText = extractContentText(node.content);

  return [ownText, childText].filter(Boolean).join(" ");
}

function matchesQuery(query: string, values: string[]) {
  if (!query) {
    return true;
  }

  return values.some((value) => value.toLowerCase().includes(query));
}

function rankResults(results: WorkspaceSearchResult[], query: string) {
  return [...results].sort((first, second) => {
    const firstScore = scoreResult(first, query);
    const secondScore = scoreResult(second, query);

    if (firstScore !== secondScore) {
      return secondScore - firstScore;
    }

    return first.title.localeCompare(second.title);
  });
}

function scoreResult(result: WorkspaceSearchResult, query: string) {
  if (!query) {
    return 0;
  }

  const title = result.title.toLowerCase();
  const path = result.path.toLowerCase();

  if (title === query) {
    return 4;
  }

  if (title.startsWith(query)) {
    return 3;
  }

  if (title.includes(query)) {
    return 2;
  }

  return path.includes(query) ? 1 : 0;
}

function getTitle(value: string, fallback: string) {
  const title = value.trim();

  return title.length > 0 ? title : fallback;
}

function readEmoji(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const emoji = (value as { emoji?: unknown }).emoji;

  return typeof emoji === "string" && emoji.length > 0 ? emoji : null;
}

function buildSearchExcerpt(content: string, query: string) {
  const normalizedContent = content.trim().replace(/\s+/g, " ");

  if (!normalizedContent) {
    return null;
  }

  if (!query) {
    return truncateExcerpt(normalizedContent);
  }

  const matchIndex = normalizedContent.toLowerCase().indexOf(query);

  if (matchIndex < 0) {
    return truncateExcerpt(normalizedContent);
  }

  const contextChars = Math.floor(MAX_SEARCH_EXCERPT_CHARS / 2);
  const start = Math.max(0, matchIndex - contextChars);
  const end = Math.min(
    normalizedContent.length,
    matchIndex + query.length + contextChars,
  );
  const excerpt = normalizedContent.slice(start, end);

  return `${start > 0 ? "…" : ""}${excerpt}${
    end < normalizedContent.length ? "…" : ""
  }`;
}

function truncateExcerpt(value: string) {
  return value.length <= MAX_SEARCH_EXCERPT_CHARS
    ? value
    : `${value.slice(0, MAX_SEARCH_EXCERPT_CHARS)}…`;
}
