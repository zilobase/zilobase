import type {
  AgentCitation,
  AgentToolResult,
} from "@zilobase/features/ai-chat/agent-contract";
import { formatPropertyValueForContext } from "@zilobase/page-context/format-property-value";
import { prosemirrorToMarkdown } from "@zilobase/page-context/prosemirror-to-markdown";
import { and, eq, isNull } from "drizzle-orm";
import { tool, type ToolSet } from "ai";
import * as Y from "yjs";
import * as z from "zod";

import {
  canAccessDatabaseRecord,
  canAccessPageInWorkspace,
} from "../access";
import { db } from "../infrastructure/database";
import { page, pageCollaborationDocument } from "../infrastructure/database/schema";
import { searchWorkspaceItems } from "../features/search/service";
import { getDatabaseRecord } from "../services/database-access";
import { getDatabasePayload } from "../services/database-payload";
import { hashPageContentMarkdown } from "./page-content-version";

const MAX_PAGE_MARKDOWN_CHARS = 48_000;
const MAX_COMMENT_BODY_CHARS = 4_000;
const MAX_QUERY_ROWS = 50;

type WorkspaceReadToolContext = {
  userId: string;
  withDb: <T>(fn: () => Promise<T>) => Promise<T>;
  workspaceId: string;
};

type AgentTable = {
  columns: Array<{
    id: string;
    label: string;
    type: string;
  }>;
  rows: Array<{
    cells: Record<string, string>;
    id: string;
    pageId: string;
  }>;
};

type PageComment = {
  author: string;
  authorId: string | null;
  body: string;
  createdAt: string;
  id: string;
};

export type PageCommentThread = {
  comments: PageComment[];
  id: string;
  kind: "block" | "inline" | "page";
  quote: string | null;
  resolvedAt: string | null;
  updatedAt: string;
};

export function buildWorkspaceReadTools(
  context: WorkspaceReadToolContext,
): ToolSet {
  return {
    searchWorkspace: tool({
      description:
        "Search all Zilobase pages and databases the current user can view. Use this for workspace-wide questions and to find exact IDs before reading a page or querying a database. Results include citations and short page excerpts.",
      inputSchema: z.object({
        query: z.string().trim().max(500).default(""),
        types: z
          .array(z.enum(["page", "database"]))
          .max(2)
          .optional(),
        limit: z.number().int().min(1).max(20).default(10),
      }),
      execute: (input) =>
        context.withDb(async () => {
          const results = await searchWorkspaceItems({
            limit: input.limit,
            membershipVerified: true,
            query: input.query,
            types: input.types,
            userId: context.userId,
            workspaceId: context.workspaceId,
          });
          const citations = results.map(toSearchCitation);

          return succeeded(
            results.length === 1
              ? "Found 1 accessible workspace item."
              : `Found ${results.length} accessible workspace items.`,
            {
              results: results.map((result) => ({
                excerpt: result.excerpt,
                id: result.id,
                path: result.path,
                title: result.title,
                type: result.type,
                updatedAt: result.updatedAt.toISOString(),
              })),
            },
            citations,
          );
        }),
    }),

    readWorkspacePage: tool({
      description:
        "Read the current stored content of a Zilobase page after checking the current user's view permission. This reads page content, not comments or content hidden inside embeds.",
      inputSchema: z.object({
        pageId: z.string().trim().min(1),
      }),
      execute: (input) =>
        context.withDb(async () => {
          const record = await readAccessiblePage(context, input.pageId);
          const fullMarkdown = prosemirrorToMarkdown(record.content);
          const markdown = truncateMarkdown(fullMarkdown);
          const citation = pageCitation(record.id, record.name, markdown);

          return succeeded(
            `Read page "${displayPageName(record.name)}".`,
            {
              contentHash: await hashPageContentMarkdown(fullMarkdown),
              id: record.id,
              markdown,
              title: displayPageName(record.name),
              updatedAt: record.updatedAt.toISOString(),
            },
            [citation],
          );
        }),
    }),

    queryWorkspaceDatabase: tool({
      description:
        "Query the rows and property values of a Zilobase database the current user can view. Use databaseId from searchWorkspace. Optionally select a data source and filter rows with a case-insensitive text query. Returns a typed table and row citations.",
      inputSchema: z.object({
        databaseId: z.string().trim().min(1),
        dataSourceId: z.string().trim().min(1).optional(),
        query: z.string().trim().max(500).optional(),
        limit: z.number().int().min(1).max(MAX_QUERY_ROWS).default(25),
      }),
      execute: (input) =>
        context.withDb(async () => {
          const record = await getDatabaseRecord(input.databaseId);

          if (
            !record ||
            record.workspaceId !== context.workspaceId ||
            !(await canAccessDatabaseRecord(record, context.userId, "view"))
          ) {
            throw new Error("Database not found or not accessible.");
          }

          const payload = await getDatabasePayload(
            record.id,
            context.userId,
            record,
            input.dataSourceId
              ? { dataSourceId: input.dataSourceId }
              : undefined,
          );

          if (!payload?.activeDataSource) {
            throw new Error("Database has no accessible data source.");
          }

          const table = buildDatabaseTable(payload, {
            limit: input.limit,
            query: input.query,
          });
          const databaseTitle = record.name.trim() || "Database";
          const citations: AgentCitation[] = [
            {
              id: record.id,
              source: "database",
              title: databaseTitle,
              url: `/d/${encodeURIComponent(record.id)}`,
            },
            ...table.rows.map((row) => ({
              id: row.pageId,
              source: "page" as const,
              title: row.cells.name || "Untitled row",
              url: `/p/${encodeURIComponent(row.pageId)}`,
            })),
          ];

          return succeeded(
            `Queried ${table.rows.length} of ${payload.rows.length} accessible rows in "${databaseTitle}".`,
            {
              dataSourceId: payload.activeDataSource.id,
              databaseId: record.id,
              table,
              totalRows: payload.rows.length,
            },
            citations,
          );
        }),
    }),

    readPageComments: tool({
      description:
        "Read page, inline, and block comments from a Zilobase page the current user can view. This tool is read-only and cannot create, edit, resolve, delete, or react to comments.",
      inputSchema: z.object({
        pageId: z.string().trim().min(1),
        includeResolved: z.boolean().default(false),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: (input) =>
        context.withDb(async () => {
          const record = await readAccessiblePage(context, input.pageId);
          const [collaboration] = await db
            .select({ state: pageCollaborationDocument.state })
            .from(pageCollaborationDocument)
            .where(eq(pageCollaborationDocument.pageId, record.id))
            .limit(1);
          const allThreads = collaboration
            ? extractPageCommentThreads(new Uint8Array(collaboration.state))
            : [];
          const threads = allThreads
            .filter((thread) => input.includeResolved || !thread.resolvedAt)
            .slice(0, input.limit);
          const title = displayPageName(record.name);
          const citations = threads.flatMap((thread) =>
            thread.comments.map((comment) => ({
              excerpt: comment.body,
              id: `${record.id}:${thread.id}:${comment.id}`,
              source: "page-comment" as const,
              title: `${title} — comment by ${comment.author}`,
              url: `/p/${encodeURIComponent(record.id)}`,
            })),
          );

          return succeeded(
            threads.length === 1
              ? `Read 1 comment thread from "${title}".`
              : `Read ${threads.length} comment threads from "${title}".`,
            { pageId: record.id, threads, title },
            citations,
          );
        }),
    }),
  };
}

async function readAccessiblePage(
  context: WorkspaceReadToolContext,
  pageId: string,
) {
  if (
    !(await canAccessPageInWorkspace(
      pageId,
      context.workspaceId,
      context.userId,
      "view",
    ))
  ) {
    throw new Error("Page not found or not accessible.");
  }

  const [record] = await db
    .select({
      content: page.content,
      id: page.id,
      name: page.name,
      updatedAt: page.updatedAt,
    })
    .from(page)
    .where(
      and(
        eq(page.id, pageId),
        eq(page.workspaceId, context.workspaceId),
        isNull(page.deletedAt),
      ),
    )
    .limit(1);

  if (!record) {
    throw new Error("Page not found or not accessible.");
  }

  return record;
}

function succeeded<T>(
  summary: string,
  data: T,
  citations: AgentCitation[],
): AgentToolResult<T> {
  return {
    citations: dedupeCitations(citations),
    data,
    ok: true,
    status: "succeeded",
    summary,
  };
}

function toSearchCitation(
  result: Awaited<ReturnType<typeof searchWorkspaceItems>>[number],
): AgentCitation {
  return {
    ...(result.excerpt ? { excerpt: result.excerpt } : {}),
    id: result.id,
    source: result.type,
    title: result.title,
    url:
      result.type === "database"
        ? `/d/${encodeURIComponent(result.id)}`
        : `/p/${encodeURIComponent(result.id)}`,
  };
}

function pageCitation(id: string, name: string, markdown: string): AgentCitation {
  return {
    ...(markdown ? { excerpt: markdown.slice(0, 280) } : {}),
    id,
    source: "page",
    title: displayPageName(name),
    url: `/p/${encodeURIComponent(id)}`,
  };
}

function dedupeCitations(citations: AgentCitation[]) {
  const seen = new Set<string>();

  return citations.filter((citation) => {
    const key = `${citation.source}:${citation.id}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function buildDatabaseTable(
  payload: NonNullable<Awaited<ReturnType<typeof getDatabasePayload>>>,
  options: { limit: number; query?: string },
): AgentTable {
  const columns: AgentTable["columns"] = [
    { id: "name", label: "Name", type: "text" },
    ...payload.properties.map(({ property }) => ({
      id: property.id,
      label: property.name.trim() || "Property",
      type: property.type,
    })),
  ];
  const valuesByCell = new Map(
    payload.values.map((value) => [
      `${value.pageId}:${value.propertyId}`,
      value.value,
    ]),
  );
  const normalizedQuery = options.query?.trim().toLowerCase() ?? "";
  const rows = payload.rows.flatMap((row) => {
    const cells: Record<string, string> = {
      name: row.page.name.trim() || "Untitled",
    };

    for (const { property } of payload.properties) {
      cells[property.id] = formatPropertyValueForContext(
        valuesByCell.get(`${row.pageId}:${property.id}`),
        property.type,
      );
    }

    if (
      normalizedQuery &&
      !Object.values(cells).some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      )
    ) {
      return [];
    }

    return [{ cells, id: row.id, pageId: row.pageId }];
  });

  return {
    columns,
    rows: rows.slice(0, Math.max(1, Math.min(options.limit, MAX_QUERY_ROWS))),
  };
}

export function extractPageCommentThreads(state: Uint8Array) {
  const document = new Y.Doc();
  Y.applyUpdate(document, state);
  const threads = document.getMap<Y.Map<unknown>>("commentThreads");

  return [...threads.entries()]
    .flatMap(([threadId, value]) => {
      if (!(value instanceof Y.Map)) {
        return [];
      }

      const messagesValue = value.get("messages");
      const comments = messagesValue instanceof Y.Map
        ? [...messagesValue.entries()]
            .flatMap(([messageId, message]) =>
              message instanceof Y.Map
                ? [readCommentMessage(messageId, message)]
                : [],
            )
            .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        : [];
      const rawKind = value.get("kind");

      return [{
        comments,
        id: threadId,
        kind:
          rawKind === "block" || rawKind === "inline" ? rawKind : "page",
        quote: readNullableString(value.get("quote")),
        resolvedAt: readNullableString(value.get("resolvedAt")),
        updatedAt:
          readString(value.get("updatedAt")) ||
          readString(value.get("createdAt")),
      } satisfies PageCommentThread];
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function readCommentMessage(
  id: string,
  message: Y.Map<unknown>,
): PageComment {
  const author = readAuthor(message.get("author"));

  return {
    author: author.name || author.email || "Unknown user",
    authorId: author.id,
    body: truncateCommentBody(readString(message.get("body"))),
    createdAt: readString(message.get("createdAt")),
    id,
  };
}

function readAuthor(value: unknown) {
  const read = (key: string) => {
    if (value instanceof Y.Map) {
      return readNullableString(value.get(key));
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      return readNullableString((value as Record<string, unknown>)[key]);
    }

    return null;
  };

  return {
    email: read("email"),
    id: read("id"),
    name: read("name"),
  };
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readNullableString(value: unknown) {
  const result = readString(value).trim();
  return result || null;
}

function truncateCommentBody(value: string) {
  return value.length <= MAX_COMMENT_BODY_CHARS
    ? value
    : `${value.slice(0, MAX_COMMENT_BODY_CHARS)}…`;
}

function truncateMarkdown(markdown: string) {
  return markdown.length <= MAX_PAGE_MARKDOWN_CHARS
    ? markdown
    : `${markdown.slice(0, MAX_PAGE_MARKDOWN_CHARS)}\n\n[Page content truncated]`;
}

function displayPageName(name: string) {
  return name.trim() || "Untitled";
}
