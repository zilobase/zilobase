WITH ordered_rows AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "data_source_id"
      ORDER BY "order_key" ASC NULLS LAST, "position" ASC, "id" ASC
    )::numeric * 1024 AS "next_order_key"
  FROM "database_row"
)
UPDATE "database_row" AS target
SET "order_key" = ordered_rows."next_order_key"
FROM ordered_rows
WHERE target."id" = ordered_rows."id";
--> statement-breakpoint
ALTER TABLE "database_row" ALTER COLUMN "order_key" SET NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "database_row_database_deleted_position_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "database_row_position_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "database_row_source_order_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "database_row_source_order_unique"
ON "database_row" USING btree ("data_source_id", "order_key")
WHERE "deleted_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "database_row" DROP COLUMN "position";
--> statement-breakpoint
DELETE FROM "database_realtime_outbox" WHERE "event_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "database_realtime_outbox" ALTER COLUMN "event_id" SET NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "database_realtime_outbox_ready_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "database_realtime_outbox_event_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "database_realtime_outbox_database_version_unique";
--> statement-breakpoint
ALTER TABLE "database_realtime_outbox"
  DROP COLUMN "database_id",
  DROP COLUMN "version",
  DROP COLUMN "actor_id",
  DROP COLUMN "changed",
  DROP COLUMN "delta",
  DROP COLUMN "requires_refetch",
  DROP COLUMN "committed_at";
--> statement-breakpoint
CREATE INDEX "database_realtime_outbox_ready_idx"
ON "database_realtime_outbox" USING btree ("next_attempt_at", "id");
--> statement-breakpoint
CREATE UNIQUE INDEX "database_realtime_outbox_event_unique"
ON "database_realtime_outbox" USING btree ("event_id");
