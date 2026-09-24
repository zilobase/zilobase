ALTER TABLE "mail_index_state" ADD COLUMN "applied_history_id" text;
--> statement-breakpoint
ALTER TABLE "mail_index_state" ADD COLUMN "desired_history_id" text;
--> statement-breakpoint
ALTER TABLE "mail_index_state" ADD COLUMN "bootstrap_history_id" text;
--> statement-breakpoint
ALTER TABLE "mail_index_state" ADD COLUMN "backfill_complete_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "mail_index_state" ADD COLUMN "recent_ready_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "mail_index_state" ADD COLUMN "last_success_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "mail_index_state" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "mail_index_state" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "mail_index_state" ADD COLUMN "committed_revision" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "mail_thread_index" ADD COLUMN "hydration_status" text DEFAULT 'complete' NOT NULL;
--> statement-breakpoint
ALTER TABLE "mail_thread_index" ADD COLUMN "search_document" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "mail_thread_index" ADD CONSTRAINT "mail_thread_index_hydration_status_check" CHECK ("hydration_status" in ('partial', 'complete'));
--> statement-breakpoint
DROP INDEX IF EXISTS "mail_index_state_active_due_idx";
--> statement-breakpoint
CREATE INDEX "mail_index_state_active_due_idx" ON "mail_index_state" USING btree ("status", "next_attempt_at", "lease_expires_at") WHERE "status" in ('pending', 'backfilling', 'syncing', 'error');
--> statement-breakpoint
CREATE TABLE "mail_message" (
  "id" text PRIMARY KEY NOT NULL,
  "gmail_account_id" text NOT NULL,
  "gmail_message_id" text NOT NULL,
  "gmail_thread_id" text NOT NULL,
  "generation" integer NOT NULL,
  "history_id" text DEFAULT '0' NOT NULL,
  "draft_id" text,
  "internal_date" bigint NOT NULL,
  "message_date" text,
  "label_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "from_address" jsonb,
  "reply_to_address" jsonb,
  "to_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "cc_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "bcc_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "subject" text NOT NULL,
  "snippet" text DEFAULT '' NOT NULL,
  "body_text" text,
  "body_html" text,
  "has_full_body" boolean DEFAULT false NOT NULL,
  "message_id_header" text,
  "in_reply_to" text,
  "references" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "size_estimate" integer DEFAULT 0 NOT NULL,
  "attachment_count" integer DEFAULT 0 NOT NULL,
  "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mail_message_account_message_unique" UNIQUE("gmail_account_id", "gmail_message_id"),
  CONSTRAINT "mail_message_gmail_account_id_gmail_account_id_fk" FOREIGN KEY ("gmail_account_id") REFERENCES "public"."gmail_account"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "mail_message_account_thread_idx" ON "mail_message" USING btree ("gmail_account_id", "gmail_thread_id");
--> statement-breakpoint
CREATE INDEX "mail_message_account_date_idx" ON "mail_message" USING btree ("gmail_account_id", "internal_date");
--> statement-breakpoint
CREATE TABLE "mail_label" (
  "id" text PRIMARY KEY NOT NULL,
  "gmail_account_id" text NOT NULL,
  "gmail_label_id" text NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL,
  "color" jsonb,
  "label_list_visibility" text,
  "message_list_visibility" text,
  "messages_total" integer,
  "messages_unread" integer,
  "threads_total" integer,
  "threads_unread" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mail_label_account_label_unique" UNIQUE("gmail_account_id", "gmail_label_id"),
  CONSTRAINT "mail_label_type_check" CHECK ("type" in ('system', 'user')),
  CONSTRAINT "mail_label_gmail_account_id_gmail_account_id_fk" FOREIGN KEY ("gmail_account_id") REFERENCES "public"."gmail_account"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "mail_label_account_name_idx" ON "mail_label" USING btree ("gmail_account_id", "name");
--> statement-breakpoint
CREATE TABLE "gmail_api_budget" (
  "google_subject" text PRIMARY KEY NOT NULL,
  "available_units" integer DEFAULT 5000 NOT NULL,
  "refilled_at" timestamp with time zone DEFAULT now() NOT NULL,
  "blocked_until" timestamp with time zone,
  "consecutive_quota_failures" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "gmail_api_budget_blocked_idx" ON "gmail_api_budget" USING btree ("blocked_until");
--> statement-breakpoint
CREATE INDEX "mail_thread_index_search_idx" ON "mail_thread_index" USING gin (to_tsvector('simple', "search_document"));
