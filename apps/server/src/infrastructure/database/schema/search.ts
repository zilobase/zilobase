import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { workspace } from "./workspaces";
import { tsvector, timestampColumns } from "./columns";

export const searchDocument = pgTable(
  "search_document",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourcePageId: text("source_page_id"),
    title: text("title").notNull(),
    path: text("path").notNull(),
    emoji: text("emoji"),
    contentText: text("content_text").notNull().default(""),
    searchVector: tsvector("search_vector").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("search_document_source_unique").on(
      table.workspaceId,
      table.sourceType,
      table.sourceId,
    ),
    index("search_document_workspace_type_updated_idx").on(
      table.workspaceId,
      table.sourceType,
      table.sourceUpdatedAt,
    ),
  ],
);

export const searchChunk = pgTable(
  "search_chunk",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => searchDocument.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    tokenEstimate: integer("token_estimate").notNull().default(0),
    searchVector: tsvector("search_vector").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("search_chunk_document_index_unique").on(table.documentId, table.chunkIndex),
    index("search_chunk_workspace_document_idx").on(table.workspaceId, table.documentId),
  ],
);
