import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";

import {
  canAccessDatabaseInWorkspace,
  getAccessiblePageIds,
  getMembership,
} from "../../access";
import { rejectMismatchedApiKeyWorkspace } from "../../api-keys";
import { db } from "../../db";
import { database, page } from "../../db/schema";
import type { AppBindings } from "../../types";
import { PageGraph } from "../../page-graph";

export const searchRoutes = new Hono<AppBindings>();

type SearchResult = {
  emoji: string | null;
  id: string;
  path: string;
  title: string;
  type: "database" | "page";
};

const maxSearchResults = 50;

const requireUser = (c: Context<AppBindings>) => c.get("user") ?? null;

searchRoutes.get("/", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const workspaceId = c.req.query("workspaceId");

  if (!workspaceId) {
    return c.json({ error: "workspaceId is required" }, 400);
  }

  const mismatch = rejectMismatchedApiKeyWorkspace(c, workspaceId);

  if (mismatch) {
    return mismatch;
  }

  if (!(await getMembership(workspaceId, user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const query = normalizeSearchQuery(c.req.query("q") ?? "");
  const accessibleIds = await getAccessiblePageIds(workspaceId, user.id, {
    membershipVerified: true,
  });

  const [pageRecords, databaseRecords] = await Promise.all([
    db
      .select({
        content: page.content,
        id: page.id,
        metadata: page.metadata,
        name: page.name,
      })
      .from(page)
      .where(
        and(
          eq(page.workspaceId, workspaceId),
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
      })
      .from(database)
      .where(
        and(
          eq(database.workspaceId, workspaceId),
          isNull(database.deletedAt),
        ),
      )
      .orderBy(asc(database.name)),
  ]);
  const visibleDatabaseRecords = (
    await Promise.all(
      databaseRecords.map(async (record) => ({
        record,
        visible: await canAccessDatabaseInWorkspace(
          record.id,
          workspaceId,
          user.id,
          "view",
        ),
      })),
    )
  )
    .filter(({ visible }) => visible)
    .map(({ record }) => record);
  const pageById = new Map(
    pageRecords.map((record) => [record.id, record]),
  );
  const pageGraph = new PageGraph({ pages: pageRecords });
  const results: SearchResult[] = [];

  for (const record of pageRecords) {
    const title = getTitle(record.name, "Untitled");
    const path = pageGraph.getPagePath(record, (value) =>
      getTitle(value, "Untitled"),
    );
    const contentText = extractContentText(record.content);

    if (matchesQuery(query, [title, path, contentText])) {
      results.push({
        emoji: readEmoji(record.metadata),
        id: record.id,
        path,
        title,
        type: "page",
      });
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
        id: record.id,
        path,
        title,
        type: "database",
      });
    }
  }

  return c.json({
    results: rankResults(results, query).slice(0, maxSearchResults),
  });
});

function normalizeSearchQuery(query: string) {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function matchesQuery(query: string, values: string[]) {
  if (!query) {
    return true;
  }

  return values.some((value) => value.toLowerCase().includes(query));
}

function rankResults(results: SearchResult[], query: string) {
  return [...results].sort((first, second) => {
    const firstScore = scoreResult(first, query);
    const secondScore = scoreResult(second, query);

    if (firstScore !== secondScore) {
      return secondScore - firstScore;
    }

    return first.title.localeCompare(second.title);
  });
}

function scoreResult(result: SearchResult, query: string) {
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

function extractContentText(content: unknown): string {
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
