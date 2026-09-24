ALTER TABLE "mail_thread_index" ADD COLUMN "snippet" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "mail_index_state" ADD COLUMN "record_version" integer DEFAULT 0 NOT NULL;
