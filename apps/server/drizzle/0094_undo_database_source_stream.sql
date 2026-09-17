DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'database_mutation_event'
      AND column_name = 'stream_kind'
  ) THEN
    DELETE FROM "database_realtime_outbox"
    WHERE "event_id" IN (
      SELECT "id" FROM "database_mutation_event" WHERE "stream_kind" = 'source'
    );
    DELETE FROM "database_mutation_event" WHERE "stream_kind" = 'source';
    ALTER TABLE "database_mutation_event" DROP CONSTRAINT IF EXISTS "database_mutation_event_stream_subject_check";
    DROP INDEX IF EXISTS "database_mutation_event_source_committed_idx";
    DROP INDEX IF EXISTS "database_mutation_event_source_version_unique";
    DROP INDEX IF EXISTS "database_mutation_event_host_version_unique";
    ALTER TABLE "database_mutation_event" DROP CONSTRAINT IF EXISTS "database_mutation_event_source_id_data_source_id_fk";
    ALTER TABLE "database_mutation_event" DROP COLUMN IF EXISTS "source_id";
    ALTER TABLE "database_mutation_event" DROP COLUMN IF EXISTS "stream_kind";
    ALTER TABLE "database_mutation_event" ALTER COLUMN "database_id" SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "database_mutation_event_database_version_unique"
      ON "database_mutation_event" USING btree ("database_id", "version");
  END IF;
END $$;
