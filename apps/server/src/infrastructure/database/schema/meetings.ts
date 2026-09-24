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
import { workspace } from "./workspaces";
import { page } from "./pages";
import { user } from "./authentication";
import { timestampColumns, bytea } from "./columns";

export const meeting = pgTable(
  "meeting",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    pageId: text("page_id")
      .notNull()
      .references(() => page.id, { onDelete: "cascade" }),
    notesPageId: text("notes_page_id").references(() => page.id, {
      onDelete: "set null",
    }),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull().default("Meeting"),
    status: text("status").notNull().default("idle"),
    language: text("language").notNull().default("en"),
    instructionsPreset: text("instructions_preset").notNull().default("auto"),
    customInstructions: text("custom_instructions"),
    consentMessage: text("consent_message")
      .notNull()
      .default("This meeting will be recorded and transcribed."),
    autoPlayConsent: boolean("auto_play_consent").notNull().default(false),
    archiveLocalAudio: boolean("archive_local_audio").notNull().default(false),
    calendarEventId: text("calendar_event_id"),
    calendarSnapshot: jsonb("calendar_snapshot"),
    transcriptRevision: integer("transcript_revision").notNull().default(0),
    summarySourceSegmentCount: integer("summary_source_segment_count").notNull().default(0),
    summaryGeneratedAt: timestamp("summary_generated_at", { withTimezone: true }),
    recorderId: text("recorder_id").references(() => user.id, {
      onDelete: "set null",
    }),
    recorderLeaseId: text("recorder_lease_id"),
    recorderLeaseExpiresAt: timestamp("recorder_lease_expires_at", {
      withTimezone: true,
    }),
    recordingStartedAt: timestamp("recording_started_at", {
      withTimezone: true,
    }),
    recordingStoppedAt: timestamp("recording_stopped_at", {
      withTimezone: true,
    }),
    durationMs: integer("duration_ms").notNull().default(0),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    index("meeting_page_deleted_idx").on(table.pageId, table.deletedAt),
    uniqueIndex("meeting_notes_page_id_unique").on(table.notesPageId),
    index("meeting_workspace_status_idx").on(table.workspaceId, table.status),
    check(
      "meeting_status_check",
      sql`${table.status} in ('idle', 'recording', 'paused', 'processing', 'completed', 'failed')`,
    ),
    check(
      "meeting_duration_check",
      sql`${table.durationMs} >= 0 and ${table.durationMs} <= 10800000`,
    ),
  ],
);

export const meetingCollaborationDocument = pgTable(
  "meeting_collaboration_document",
  {
    meetingId: text("meeting_id")
      .primaryKey()
      .references(() => meeting.id, { onDelete: "cascade" }),
    state: bytea("state").notNull(),
    ...timestampColumns(),
  },
  (table) => [index("meeting_collaboration_document_updated_idx").on(table.updatedAt)],
);

export const meetingTranscriptSegment = pgTable(
  "meeting_transcript_segment",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    sequence: integer("sequence").notNull(),
    text: text("text").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    speaker: text("speaker"),
    providerItemId: text("provider_item_id"),
    source: text("source").$type<"microphone" | "system">().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("meeting_transcript_revision_sequence_unique").on(
      table.meetingId,
      table.revision,
      table.sequence,
    ),
    uniqueIndex("meeting_transcript_provider_item_unique").on(
      table.meetingId,
      table.providerItemId,
    ),
    index("meeting_transcript_revision_idx").on(table.meetingId, table.revision),
    check(
      "meeting_transcript_offsets_check",
      sql`${table.startMs} >= 0 and ${table.endMs} >= ${table.startMs}`,
    ),
    check("meeting_transcript_source_check", sql`${table.source} in ('microphone', 'system')`),
  ],
);

export const meetingConsentEvent = pgTable(
  "meeting_consent_event",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    mode: text("mode").notNull(),
    message: text("message").notNull(),
    metadata: jsonb("metadata"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("meeting_consent_meeting_idx").on(table.meetingId)],
);
