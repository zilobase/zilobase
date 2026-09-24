import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { workspace, teamspace } from "./workspaces";
import { user } from "./authentication";
import { softDeleteColumns } from "./soft-delete-columns";
import { timestampColumns, bytea } from "./columns";

export const page = pgTable(
  "page",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    teamspaceId: text("teamspace_id").references(() => teamspace.id, {
      onDelete: "restrict",
    }),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull().default("pageblock"),
    name: text("name").notNull(),
    url: text("url").notNull().default("#"),
    content: jsonb("content"),
    hasContent: boolean("has_content").notNull().default(false),
    metadata: jsonb("metadata"),
    ...softDeleteColumns(),
  },
  (table) => [
    index("page_workspace_deleted_idx").on(table.workspaceId, table.deletedAt),
    index("page_workspace_teamspace_deleted_idx").on(
      table.workspaceId,
      table.teamspaceId,
      table.deletedAt,
    ),
    index("page_type_idx").on(table.type),
    index("page_deleted_at_idx").on(table.deletedAt),
  ],
);

export const pageLayout = pgTable(
  "page_layout",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id").notNull(),
    config: jsonb("config").notNull(),
    ...timestampColumns(),
  },
  (table) => [
    index("page_layout_workspace_idx").on(table.workspaceId),
    uniqueIndex("page_layout_scope_unique").on(table.scopeType, table.scopeId),
  ],
);

export const pageCollaborationDocument = pgTable(
  "page_collaboration_document",
  {
    pageId: text("page_id")
      .primaryKey()
      .references(() => page.id, { onDelete: "cascade" }),
    state: bytea("state").notNull(),
    ...timestampColumns(),
  },
  (table) => [index("page_collaboration_document_updated_idx").on(table.updatedAt)],
);

export const pageAccess = pgTable(
  "page_access",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    pageId: text("page_id")
      .notNull()
      .references(() => page.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    accessLevel: text("access_level").notNull().default("view"),
    ...timestampColumns(),
  },
  (table) => [
    index("page_access_target_idx").on(table.workspaceId, table.targetType, table.targetId),
    uniqueIndex("page_access_target_unique").on(table.pageId, table.targetType, table.targetId),
  ],
);

export const pageGuestInvitation = pgTable(
  "page_guest_invitation",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    pageId: text("page_id")
      .notNull()
      .references(() => page.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    accessLevel: text("access_level").notNull().default("view"),
    status: text("status").notNull().default("pending"),
    inviterId: text("inviter_id").references(() => user.id, {
      onDelete: "set null",
    }),
    acceptedByUserId: text("accepted_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    index("page_guest_invitation_workspace_status_idx").on(table.workspaceId, table.status),
    index("page_guest_invitation_page_status_idx").on(table.pageId, table.status),
    index("page_guest_invitation_email_idx").on(table.email),
    uniqueIndex("page_guest_invitation_pending_unique")
      .on(table.pageId, sql`lower(${table.email})`)
      .where(sql`${table.status} = 'pending'`),
    check(
      "page_guest_invitation_access_level_check",
      sql`${table.accessLevel} in ('view', 'comment', 'edit', 'full')`,
    ),
    check(
      "page_guest_invitation_status_check",
      sql`${table.status} in ('pending', 'accepted', 'cancelled', 'expired')`,
    ),
  ],
);

export const pageGuestRequest = pgTable(
  "page_guest_request",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    pageId: text("page_id")
      .notNull()
      .references(() => page.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    accessLevel: text("access_level").notNull().default("view"),
    status: text("status").notNull().default("pending"),
    requesterId: text("requester_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    index("page_guest_request_workspace_status_idx").on(table.workspaceId, table.status),
    index("page_guest_request_page_status_idx").on(table.pageId, table.status),
    uniqueIndex("page_guest_request_pending_unique")
      .on(table.pageId, sql`lower(${table.email})`)
      .where(sql`${table.status} = 'pending'`),
    check(
      "page_guest_request_access_level_check",
      sql`${table.accessLevel} in ('view', 'comment', 'edit', 'full')`,
    ),
    check(
      "page_guest_request_status_check",
      sql`${table.status} in ('pending', 'approved', 'rejected', 'cancelled')`,
    ),
  ],
);
