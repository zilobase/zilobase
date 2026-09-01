CREATE TABLE "mail_database_sync_record" (
  "id" text PRIMARY KEY NOT NULL,
  "binding_id" text NOT NULL REFERENCES "gmail_workspace_connection"("id") ON DELETE CASCADE,
  "view_id" text NOT NULL REFERENCES "mail_view"("id") ON DELETE CASCADE,
  "gmail_thread_id" text NOT NULL,
  "destination_data_source_id" text NOT NULL REFERENCES "data_source"("id") ON DELETE RESTRICT,
  "database_row_id" text NOT NULL,
  "page_id" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "last_source_updated_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mail_database_sync_record_status_check" CHECK ("status" in ('active', 'paused'))
);
CREATE UNIQUE INDEX "mail_database_sync_record_view_thread_unique" ON "mail_database_sync_record" USING btree ("view_id", "gmail_thread_id");
CREATE INDEX "mail_database_sync_record_binding_idx" ON "mail_database_sync_record" USING btree ("binding_id", "updated_at");
CREATE INDEX "mail_database_sync_record_destination_idx" ON "mail_database_sync_record" USING btree ("destination_data_source_id", "database_row_id");

CREATE TABLE "mail_database_sync_outbox" (
  "id" text PRIMARY KEY NOT NULL,
  "binding_id" text NOT NULL REFERENCES "gmail_workspace_connection"("id") ON DELETE CASCADE,
  "view_id" text NOT NULL REFERENCES "mail_view"("id") ON DELETE CASCADE,
  "gmail_thread_id" text NOT NULL,
  "source_updated_at" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lease_expires_at" timestamp with time zone,
  "worker_id" text,
  "last_error" text,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mail_database_sync_outbox_status_check" CHECK ("status" in ('pending', 'processing', 'retry', 'completed', 'paused'))
);
CREATE UNIQUE INDEX "mail_database_sync_outbox_view_thread_unique" ON "mail_database_sync_outbox" USING btree ("view_id", "gmail_thread_id");
CREATE INDEX "mail_database_sync_outbox_ready_idx" ON "mail_database_sync_outbox" USING btree ("status", "next_attempt_at");
CREATE INDEX "mail_database_sync_outbox_binding_idx" ON "mail_database_sync_outbox" USING btree ("binding_id", "updated_at");
