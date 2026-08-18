ALTER TABLE "meeting" ADD COLUMN "summary_source_segment_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "meeting" ADD COLUMN "summary_generated_at" timestamp with time zone;
