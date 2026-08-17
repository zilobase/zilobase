CREATE TABLE "meeting" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"page_id" text NOT NULL,
	"created_by_id" text,
	"title" text DEFAULT 'Meeting' NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"instructions_preset" text DEFAULT 'auto' NOT NULL,
	"custom_instructions" text,
	"consent_message" text DEFAULT 'This meeting will be recorded and transcribed.' NOT NULL,
	"auto_play_consent" boolean DEFAULT false NOT NULL,
	"archive_local_audio" boolean DEFAULT false NOT NULL,
	"calendar_event_id" text,
	"calendar_snapshot" jsonb,
	"transcript_revision" integer DEFAULT 0 NOT NULL,
	"recorder_id" text,
	"recorder_lease_expires_at" timestamp with time zone,
	"recording_started_at" timestamp with time zone,
	"recording_stopped_at" timestamp with time zone,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_status_check" CHECK ("meeting"."status" in ('idle', 'recording', 'paused', 'processing', 'completed', 'failed')),
	CONSTRAINT "meeting_duration_check" CHECK ("meeting"."duration_ms" >= 0 and "meeting"."duration_ms" <= 10800000)
);
--> statement-breakpoint
CREATE TABLE "meeting_collaboration_document" (
	"meeting_id" text PRIMARY KEY NOT NULL,
	"state" bytea NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_transcript_segment" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"revision" integer NOT NULL,
	"sequence" integer NOT NULL,
	"text" text NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"speaker" text,
	"provider_item_id" text,
	"source" text DEFAULT 'live' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_transcript_offsets_check" CHECK ("meeting_transcript_segment"."start_ms" >= 0 and "meeting_transcript_segment"."end_ms" >= "meeting_transcript_segment"."start_ms")
);
--> statement-breakpoint
CREATE TABLE "meeting_consent_event" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"user_id" text,
	"mode" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_page_id_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."page"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_recorder_id_user_id_fk" FOREIGN KEY ("recorder_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meeting_collaboration_document" ADD CONSTRAINT "meeting_collaboration_document_meeting_id_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meeting_transcript_segment" ADD CONSTRAINT "meeting_transcript_segment_meeting_id_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meeting_consent_event" ADD CONSTRAINT "meeting_consent_event_meeting_id_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meeting_consent_event" ADD CONSTRAINT "meeting_consent_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "meeting_page_deleted_idx" ON "meeting" USING btree ("page_id", "deleted_at");
--> statement-breakpoint
CREATE INDEX "meeting_workspace_status_idx" ON "meeting" USING btree ("workspace_id", "status");
--> statement-breakpoint
CREATE INDEX "meeting_collaboration_document_updated_idx" ON "meeting_collaboration_document" USING btree ("updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_transcript_revision_sequence_unique" ON "meeting_transcript_segment" USING btree ("meeting_id", "revision", "sequence");
--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_transcript_provider_item_unique" ON "meeting_transcript_segment" USING btree ("meeting_id", "provider_item_id");
--> statement-breakpoint
CREATE INDEX "meeting_transcript_revision_idx" ON "meeting_transcript_segment" USING btree ("meeting_id", "revision");
--> statement-breakpoint
CREATE INDEX "meeting_consent_meeting_idx" ON "meeting_consent_event" USING btree ("meeting_id");
