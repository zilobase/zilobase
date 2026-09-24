import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { workspace } from "./workspaces";
import { user } from "./authentication";
import { timestampColumns } from "./columns";

export const aiJob = pgTable(
  "ai_job",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    status: text("status").notNull().default("queued"),
    input: jsonb("input").notNull(),
    output: jsonb("output"),
    error: text("error"),
    progress: integer("progress").notNull().default(0),
    attempt: integer("attempt").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    leasedAt: timestamp("leased_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    workerId: text("worker_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("ai_job_dedupe_unique").on(table.workspaceId, table.type, table.dedupeKey),
    index("ai_job_claim_idx").on(table.status, table.availableAt, table.leaseExpiresAt),
    index("ai_job_active_due_idx")
      .on(table.availableAt, table.leaseExpiresAt, table.createdAt)
      .where(sql`${table.status} in ('queued', 'running')`),
    index("ai_job_owner_created_idx").on(table.workspaceId, table.userId, table.createdAt),
    check(
      "ai_job_status_check",
      sql`${table.status} in ('queued', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
    check("ai_job_progress_check", sql`${table.progress} between 0 and 100`),
  ],
);

export const backgroundMaintenanceTask = pgTable(
  "background_maintenance_task",
  {
    taskKey: text("task_key").primaryKey(),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastStartedAt: timestamp("last_started_at", { withTimezone: true }),
    lastSucceededAt: timestamp("last_succeeded_at", { withTimezone: true }),
    lastFailedAt: timestamp("last_failed_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    ...timestampColumns(),
  },
  (table) => [
    index("background_maintenance_task_due_idx").on(table.nextRunAt, table.leaseExpiresAt),
  ],
);
