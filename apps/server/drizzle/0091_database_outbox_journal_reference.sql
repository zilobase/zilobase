ALTER TABLE "database_realtime_outbox" ADD COLUMN "event_id" text;
--> statement-breakpoint
UPDATE "database_realtime_outbox" AS delivery
SET "event_id" = event."id"
FROM "database_mutation_event" AS event
WHERE event."id" = delivery."id";
--> statement-breakpoint
ALTER TABLE "database_realtime_outbox"
ADD CONSTRAINT "database_realtime_outbox_event_id_database_mutation_event_id_fk"
FOREIGN KEY ("event_id") REFERENCES "public"."database_mutation_event"("id")
ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "database_realtime_outbox_event_idx"
ON "database_realtime_outbox" USING btree ("event_id");
