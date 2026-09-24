import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./authentication";
import { timestampColumns } from "./columns";

export const workspace = pgTable(
  "workspace",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    metadata: text("metadata"),
    guestInviteMode: text("guest_invite_mode").notNull().default("direct"),
    teamspaceCreationPolicy: text("teamspace_creation_policy")
      .notNull()
      .default("workspace_members"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "workspace_guest_invite_mode_check",
      sql`${table.guestInviteMode} in ('direct', 'request', 'owners_only')`,
    ),
    check(
      "workspace_teamspace_creation_policy_check",
      sql`${table.teamspaceCreationPolicy} in ('workspace_owners', 'workspace_members')`,
    ),
  ],
);

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("member_workspace_user_unique").on(table.organizationId, table.userId),
    index("member_user_id_idx").on(table.userId),
    index("member_access_expires_at_idx").on(table.accessExpiresAt),
    check(
      "member_temporary_expiry_check",
      sql`(${table.role} = 'temporary' and ${table.accessExpiresAt} is not null) or (${table.role} <> 'temporary' and ${table.accessExpiresAt} is null)`,
    ),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at"),
    membershipExpiresAt: timestamp("membership_expires_at", {
      withTimezone: true,
    }),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    teamId: text("team_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("invitation_workspace_status_idx").on(table.organizationId, table.status),
    index("invitation_email_idx").on(table.email),
    index("invitation_membership_expires_at_idx").on(table.membershipExpiresAt),
    check(
      "invitation_temporary_expiry_check",
      sql`(${table.role} = 'temporary' and ${table.membershipExpiresAt} is not null) or (${table.role} <> 'temporary' and ${table.membershipExpiresAt} is null)`,
    ),
  ],
);

export const team = pgTable(
  "team",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    memberCount: integer("member_count").notNull().default(0),
    organizationId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("team_workspace_id_idx").on(table.organizationId)],
);

export const teamMember = pgTable(
  "teamMember",
  {
    id: text("id").primaryKey(),
    membershipKey: text("membership_key").unique(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("team_member_user_team_idx").on(table.userId, table.teamId),
    index("team_member_team_id_idx").on(table.teamId),
  ],
);

export const teamspace = pgTable(
  "teamspace",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    icon: jsonb("icon"),
    accessMode: text("access_mode").notNull().default("closed"),
    memberAccessLevel: text("member_access_level").notNull().default("edit"),
    invitePolicy: text("invite_policy").notNull().default("owners_and_members"),
    sidebarEditPolicy: text("sidebar_edit_policy").notNull().default("owners_and_members"),
    isDefault: boolean("is_default").notNull().default(false),
    inviteLinkEnabled: boolean("invite_link_enabled").notNull().default(false),
    inviteLinkTokenHash: text("invite_link_token_hash"),
    guestsEnabled: boolean("guests_enabled").notNull().default(true),
    publicSharingEnabled: boolean("public_sharing_enabled").notNull().default(true),
    exportEnabled: boolean("export_enabled").notNull().default(true),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    archivedById: text("archived_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    index("teamspace_workspace_archived_updated_idx").on(
      table.workspaceId,
      table.archivedAt,
      table.updatedAt,
    ),
    index("teamspace_workspace_default_idx").on(table.workspaceId, table.isDefault),
    uniqueIndex("teamspace_workspace_active_name_unique")
      .on(table.workspaceId, sql`lower(${table.name})`)
      .where(sql`${table.archivedAt} is null`),
    uniqueIndex("teamspace_invite_link_token_hash_unique")
      .on(table.inviteLinkTokenHash)
      .where(sql`${table.inviteLinkTokenHash} is not null`),
    check("teamspace_access_mode_check", sql`${table.accessMode} in ('open', 'closed', 'private')`),
    check(
      "teamspace_member_access_level_check",
      sql`${table.memberAccessLevel} in ('view', 'comment', 'edit', 'full')`,
    ),
    check(
      "teamspace_invite_policy_check",
      sql`${table.invitePolicy} in ('owners', 'owners_and_members')`,
    ),
    check(
      "teamspace_sidebar_edit_policy_check",
      sql`${table.sidebarEditPolicy} in ('owners', 'owners_and_members')`,
    ),
    check(
      "teamspace_invite_link_state_check",
      sql`not ${table.inviteLinkEnabled} or ${table.inviteLinkTokenHash} is not null`,
    ),
  ],
);

export const teamspacePrincipal = pgTable(
  "teamspace_principal",
  {
    id: text("id").primaryKey(),
    teamspaceId: text("teamspace_id")
      .notNull()
      .references(() => teamspace.id, { onDelete: "cascade" }),
    principalType: text("principal_type").notNull(),
    principalId: text("principal_id").notNull(),
    role: text("role").notNull().default("member"),
    membershipSource: text("membership_source").notNull().default("explicit"),
    accessLevelOverride: text("access_level_override"),
    addedById: text("added_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("teamspace_principal_unique").on(
      table.teamspaceId,
      table.principalType,
      table.principalId,
    ),
    index("teamspace_principal_lookup_idx").on(table.principalType, table.principalId),
    index("teamspace_principal_teamspace_role_idx").on(table.teamspaceId, table.role),
    check("teamspace_principal_type_check", sql`${table.principalType} in ('user', 'team')`),
    check("teamspace_principal_role_check", sql`${table.role} in ('owner', 'member')`),
    check(
      "teamspace_principal_membership_source_check",
      sql`${table.membershipSource} in ('creator', 'explicit', 'default', 'self_join', 'invite_link', 'group')`,
    ),
    check(
      "teamspace_principal_access_override_check",
      sql`${table.accessLevelOverride} is null or ${table.accessLevelOverride} in ('view', 'comment', 'edit', 'full')`,
    ),
  ],
);

export const workspaceGuest = pgTable(
  "workspace_guest",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    invitedById: text("invited_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("workspace_guest_workspace_user_unique").on(table.workspaceId, table.userId),
    index("workspace_guest_user_idx").on(table.userId),
  ],
);
