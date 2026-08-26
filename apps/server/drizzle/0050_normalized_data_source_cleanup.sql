UPDATE "database"
SET "config" = COALESCE("config", '{}'::jsonb) - 'linkedDatabaseViews' - 'hiddenViewIds'
WHERE COALESCE("config", '{}'::jsonb) ?| ARRAY['linkedDatabaseViews', 'hiddenViewIds'];
--> statement-breakpoint
UPDATE "data_source"
SET "config" = COALESCE("config", '{}'::jsonb) - 'linkedDatabaseViews' - 'hiddenViewIds'
WHERE COALESCE("config", '{}'::jsonb) ?| ARRAY['linkedDatabaseViews', 'hiddenViewIds'];
--> statement-breakpoint
ALTER TABLE "database" ADD CONSTRAINT "database_config_normalized_data_sources" CHECK (
	"config" IS NULL OR NOT ("config" ?| ARRAY['linkedDatabaseViews', 'hiddenViewIds'])
);
--> statement-breakpoint
ALTER TABLE "data_source" ADD CONSTRAINT "data_source_config_normalized" CHECK (
	"config" IS NULL OR NOT ("config" ?| ARRAY['linkedDatabaseViews', 'hiddenViewIds'])
);
