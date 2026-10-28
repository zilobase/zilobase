import type { ChatRunStatus, ChatRunEvent, ChatReadProgress } from "@zilobase/features/runtime";
import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  primaryKey,
  uniqueIndex,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { BuildContextResult, ResourceRef } from "@zilobase/page-context";
import { user } from "./authentication";
import { workspace } from "./workspaces";
import { timestampColumns } from "./columns";

export const askAiThread = pgTable(
  "ask_ai_thread",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    compactedMemory: text("compacted_memory"),
    ...timestampColumns(),
  },
  (table) => [
    index("ask_ai_thread_owner_idx").on(table.workspaceId, table.userId, table.updatedAt),
  ],
);

export const askAiTurn = pgTable(
  "ask_ai_turn",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => askAiThread.id, { onDelete: "cascade" }),
    requestHash: text("request_hash").notNull(),
    userText: text("user_text").notNull(),
    assistantText: text("assistant_text").notNull().default(""),
    status: text("status").notNull().default("streaming"),
    roots: jsonb("roots").$type<ResourceRef[]>().notNull(),
    // Coverage and IDs only. Full page/database snapshots are not retained.
    context: jsonb("context").$type<Omit<BuildContextResult, "markdown">>().notNull(),
    progress: jsonb("progress")
      .$type<ChatReadProgress>()
      .notNull()
      .default({ activities: [], canContinue: false }),
    usage: jsonb("usage").$type<{ inputTokens?: number; outputTokens?: number }>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestampColumns(),
  },
  (table) => [
    index("ask_ai_turn_thread_idx").on(table.threadId, table.createdAt),
    check(
      "ask_ai_turn_status_check",
      sql`${table.status} in ('streaming', 'completed', 'stopped', 'failed', 'interrupted')`,
    ),
  ],
);

export const askAiRun = pgTable(
  "ask_ai_run",
  {
    id: text("id").primaryKey(),
    turnId: text("turn_id")
      .notNull()
      .unique()
      .references(() => askAiTurn.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => askAiThread.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    cellId: text("cell_id").notNull(),
    model: text("model").notNull(),
    background: boolean("background").notNull().default(false),
    agentVersion: integer("agent_version").notNull().default(1),
    status: text("status").$type<ChatRunStatus>().notNull().default("queued"),
    seq: integer("seq").notNull().default(0),
    fence: integer("fence").notNull().default(0),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    providerStartedAt: timestamp("provider_started_at", { withTimezone: true }),
    responseId: text("response_id"),
    providerCursor: integer("provider_cursor"),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    index("ask_ai_run_owner_idx").on(table.workspaceId, table.userId, table.createdAt),
    uniqueIndex("ask_ai_run_active_thread_idx")
      .on(table.threadId)
      .where(sql`${table.status} in ('queued','running')`),
    index("ask_ai_run_recovery_idx").on(table.cellId, table.status, table.leaseExpiresAt),
    check(
      "ask_ai_run_status_check",
      sql`${table.status} in ('queued','running','completed','stopped','failed','interrupted')`,
    ),
  ],
);
export const askAiRunEvent = pgTable(
  "ask_ai_run_event",
  {
    runId: text("run_id")
      .notNull()
      .references(() => askAiRun.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    event: jsonb("event").$type<ChatRunEvent>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.seq] })],
);
export const askAiRunInput = pgTable("ask_ai_run_input", {
  runId: text("run_id")
    .primaryKey()
    .references(() => askAiRun.id, { onDelete: "cascade" }),
  sealed: text("sealed").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
