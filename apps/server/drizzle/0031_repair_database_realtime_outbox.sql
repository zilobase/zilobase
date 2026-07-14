ALTER TABLE "database_realtime_outbox" ADD COLUMN IF NOT EXISTS "requires_refetch" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "database_realtime_outbox" ADD COLUMN IF NOT EXISTS "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'database_realtime_outbox'
			AND column_name = 'published_at'
	) THEN
		EXECUTE 'DELETE FROM "database_realtime_outbox" WHERE "published_at" IS NOT NULL';
	END IF;
END
$$;
--> statement-breakpoint
DROP INDEX IF EXISTS "database_realtime_outbox_unpublished_idx";
--> statement-breakpoint
ALTER TABLE "database_realtime_outbox" DROP COLUMN IF EXISTS "published_at";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "database_realtime_outbox_ready_idx" ON "database_realtime_outbox" USING btree ("next_attempt_at", "committed_at");
