import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import {
  canAccessDatabaseInWorkspace,
  getAccessiblePageIds,
  getMembership,
} from "../access";
import { db } from "../../infrastructure/database";
import { database, databaseView, searchDocument } from "../../infrastructure/database/schema";

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
const SEARCH_HEADLINE_START = "__ZILOBASE_MATCH_START__";
const SEARCH_HEADLINE_STOP = "__ZILOBASE_MATCH_STOP__";
export const SEARCH_HEADLINE_OPTIONS =
  `MaxWords=35, MinWords=10, StartSel=${SEARCH_HEADLINE_START}, StopSel=${SEARCH_HEADLINE_STOP}`;

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

  const types = [...requestedTypes];
  if (types.length === 0) return [];
  const candidateLimit = Math.min(Math.max(limit * 5, 50), 500);
  const tsQuery = query
    ? sql`websearch_to_tsquery('simple', ${query})`
    : null;
  const matchingViewDatabaseIds = tsQuery && requestedTypes.has("database")
    ? (
        await db
          .selectDistinct({ databaseId: databaseView.databaseId })
          .from(databaseView)
          .innerJoin(database, eq(database.id, databaseView.databaseId))
          .where(and(
            eq(database.workspaceId, input.workspaceId),
            isNull(database.deletedAt),
            sql`to_tsvector('simple', ${databaseView.name}) @@ ${tsQuery}`,
          ))
          .limit(candidateLimit)
      ).map((match) => match.databaseId)
    : [];
  const excerpt = tsQuery
    ? sql<string | null>`nullif(ts_headline('simple', ${searchDocument.contentText}, ${tsQuery}, ${SEARCH_HEADLINE_OPTIONS}), '')`
    : sql<string | null>`nullif(left(${searchDocument.contentText}, ${MAX_SEARCH_EXCERPT_CHARS}), '')`;
  const rank = tsQuery
    ? sql<number>`ts_rank_cd(${searchDocument.searchVector}, ${tsQuery})`
    : null;
  const candidates = await db
    .select({
      emoji: searchDocument.emoji,
      excerpt,
      id: searchDocument.sourceId,
      path: searchDocument.path,
      sourcePageId: searchDocument.sourcePageId,
      title: searchDocument.title,
      type: searchDocument.sourceType,
      updatedAt: searchDocument.sourceUpdatedAt,
    })
    .from(searchDocument)
    .where(and(
      eq(searchDocument.workspaceId, input.workspaceId),
      inArray(searchDocument.sourceType, types),
      tsQuery
        ? or(
            sql`${searchDocument.searchVector} @@ ${tsQuery}`,
            matchingViewDatabaseIds.length
              ? and(
                  eq(searchDocument.sourceType, "database"),
                  inArray(searchDocument.sourceId, matchingViewDatabaseIds),
                )
              : undefined,
          )
        : undefined,
    ))
    .orderBy(...(
      rank
        ? [desc(rank), searchDocument.title]
        : [searchDocument.title]
    ))
    .limit(candidateLimit);

  const permissionChecks = await Promise.all(candidates.map(async (candidate) => {
    if (candidate.type === "page") {
      return accessibleIds.has(candidate.id);
    }
    if (candidate.type !== "database") return false;
    if (candidate.sourcePageId && !accessibleIds.has(candidate.sourcePageId)) {
      return false;
    }
    return canAccessDatabaseInWorkspace(
      candidate.id,
      input.workspaceId,
      input.userId,
      "view",
    );
  }));

  return candidates
    .filter((candidate, index) => permissionChecks[index])
    .map((candidate): WorkspaceSearchResult => ({
      emoji: candidate.emoji,
      excerpt: candidate.type === "page"
        ? stripSearchHeadlineMarkers(candidate.excerpt)
        : null,
      id: candidate.id,
      path: candidate.path,
      title: candidate.title,
      type: candidate.type as WorkspaceSearchResult["type"],
      updatedAt: candidate.updatedAt,
    }))
    .slice(0, limit);
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

export function stripSearchHeadlineMarkers(value: string | null) {
  return value
    ?.replaceAll(SEARCH_HEADLINE_START, "")
    .replaceAll(SEARCH_HEADLINE_STOP, "") ?? null;
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
