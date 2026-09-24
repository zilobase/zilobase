import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  foreignKey,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";
import { user } from "./authentication";
import { member } from "./workspaces";
import type {
  CalendarEvent,
  CalendarRecord,
  CalendarPreferences,
  CalendarMutationResponse,
} from "../../../shared/contracts/calendar";

export const calendarAccount = pgTable(
  "calendar_account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    googleSubject: text("google_subject").notNull(),
    email: text("email").notNull(),
    secret: jsonb("secret")
      .$type<{ ciphertext: string; iv: string; keyVersion: string }>()
      .notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    status: text("status").notNull().default("connected"),
  },
  (t) => [
    uniqueIndex("calendar_account_owner_subject").on(t.userId, t.googleSubject),
    uniqueIndex("calendar_account_owner_id").on(t.id, t.userId),
    check("calendar_account_status", sql`${t.status} in ('connected', 'reconnect_required')`),
  ],
);
export const calendarBinding = pgTable(
  "calendar_binding",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    accountId: text("account_id").notNull(),
  },
  (t) => [
    uniqueIndex("calendar_binding_scope").on(t.userId, t.workspaceId, t.accountId),
    foreignKey({
      columns: [t.accountId, t.userId],
      foreignColumns: [calendarAccount.id, calendarAccount.userId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.workspaceId, t.userId],
      foreignColumns: [member.organizationId, member.userId],
    }).onDelete("cascade"),
  ],
);
export const calendarOauthAttempt = pgTable(
  "calendar_oauth_attempt",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    stateHash: text("state_hash").notNull().unique(),
    verifier: jsonb("verifier")
      .$type<{ ciphertext: string; iv: string; keyVersion: string }>()
      .notNull(),
    clientKind: text("client_kind").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.userId],
      foreignColumns: [member.organizationId, member.userId],
    }).onDelete("cascade"),
  ],
);
export const calendarProviderCalendar = pgTable(
  "calendar_provider_calendar",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => calendarAccount.id, { onDelete: "cascade" }),
    calendarId: text("calendar_id").notNull(),
    data: jsonb("data").$type<CalendarRecord>().notNull(),
    syncToken: text("sync_token"),
    pageToken: text("page_token"),
    generation: integer("generation").notNull().default(1),
    revision: integer("revision").notNull().default(0),
    leaseId: text("lease_id"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    dirtyAt: timestamp("dirty_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.calendarId] })],
);
export const calendarEventRecord = pgTable(
  "calendar_event_record",
  {
    accountId: text("account_id").notNull(),
    calendarId: text("calendar_id").notNull(),
    eventId: text("event_id").notNull(),
    data: jsonb("data").$type<CalendarEvent>().notNull(),
    generation: integer("generation").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.calendarId, t.eventId] }),
    foreignKey({
      columns: [t.accountId, t.calendarId],
      foreignColumns: [calendarProviderCalendar.accountId, calendarProviderCalendar.calendarId],
    }).onDelete("cascade"),
  ],
);
export const calendarRangeSnapshot = pgTable(
  "calendar_range_snapshot",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    calendarId: text("calendar_id").notNull(),
    start: text("start").notNull(),
    end: text("end").notNull(),
    generation: integer("generation").notNull(),
    revision: integer("revision").notNull(),
    events: jsonb("events").$type<CalendarEvent[]>().notNull(),
    pageToken: text("page_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.accountId, t.calendarId],
      foreignColumns: [calendarProviderCalendar.accountId, calendarProviderCalendar.calendarId],
    }).onDelete("cascade"),
  ],
);
export const calendarWatchChannel = pgTable("calendar_watch_channel", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => calendarAccount.id, { onDelete: "cascade" }),
  calendarId: text("calendar_id"),
  messageNumber: text("message_number").notNull().default("0"),
  dirtyAt: timestamp("dirty_at", { withTimezone: true }),
  tokenHash: text("token_hash").notNull(),
  resourceId: text("resource_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("pending"),
});
export const calendarMutationReceipt = pgTable("calendar_mutation_receipt", {
  id: text("id").primaryKey(),
  bindingId: text("binding_id")
    .notNull()
    .references(() => calendarBinding.id, { onDelete: "cascade" }),
  requestHash: text("request_hash").notNull(),
  calendarId: text("calendar_id").notNull(),
  eventId: text("event_id").notNull(),
  status: text("status").notNull().default("pending"),
  result: jsonb("result").$type<CalendarMutationResponse>(),
  steps: jsonb("steps").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const calendarNotificationOutbox = pgTable("calendar_notification_outbox", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => calendarAccount.id, { onDelete: "cascade" }),
  calendarId: text("calendar_id").notNull(),
  revision: integer("revision").notNull(),
  generation: integer("generation").notNull(),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
});
export const calendarPreference = pgTable(
  "calendar_preference",
  {
    userId: text("user_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    data: jsonb("data").$type<CalendarPreferences>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.workspaceId] }),
    foreignKey({
      columns: [t.workspaceId, t.userId],
      foreignColumns: [member.organizationId, member.userId],
    }).onDelete("cascade"),
  ],
);
