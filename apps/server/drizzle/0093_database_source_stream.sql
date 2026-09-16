ALTER TABLE "database_mutation_event" ADD COLUMN "stream_kind" text DEFAULT 'host' NOT NULL;--> statement-breakpoint
ALTER TABLE "database_mutation_event" ALTER COLUMN "database_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "database_mutation_event" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "database_mutation_event" ADD CONSTRAINT "database_mutation_event_source_id_data_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DROP INDEX "database_mutation_event_database_version_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "database_mutation_event_host_version_unique" ON "database_mutation_event" USING btree ("database_id","version") WHERE "database_mutation_event"."stream_kind" = 'host';--> statement-breakpoint
CREATE UNIQUE INDEX "database_mutation_event_source_version_unique" ON "database_mutation_event" USING btree ("source_id","version") WHERE "database_mutation_event"."stream_kind" = 'source';--> statement-breakpoint
CREATE INDEX "database_mutation_event_source_committed_idx" ON "database_mutation_event" USING btree ("source_id","committed_at");--> statement-breakpoint
ALTER TABLE "database_mutation_event" ADD CONSTRAINT "database_mutation_event_stream_subject_check" CHECK (("database_mutation_event"."stream_kind" = 'host' AND "database_mutation_event"."database_id" IS NOT NULL AND "database_mutation_event"."source_id" IS NULL) OR ("database_mutation_event"."stream_kind" = 'source' AND "database_mutation_event"."database_id" IS NULL AND "database_mutation_event"."source_id" IS NOT NULL));
