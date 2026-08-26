CREATE TABLE "data_source" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"parent_database_id" text NOT NULL,
	"created_by_id" text,
	"name" text NOT NULL,
	"config" jsonb,
	"config_version" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"deleted_by_id" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "database_data_source" (
	"database_id" text NOT NULL,
	"data_source_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"linked_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "database_view" ADD COLUMN "data_source_id" text;
--> statement-breakpoint
ALTER TABLE "database_property" ADD COLUMN "data_source_id" text;
--> statement-breakpoint
ALTER TABLE "database_row" ADD COLUMN "data_source_id" text;
--> statement-breakpoint
INSERT INTO "data_source" (
	"id", "workspace_id", "parent_database_id", "created_by_id", "name", "config",
	"version", "deleted_by_id", "deleted_at", "created_at", "updated_at"
)
SELECT
	gen_random_uuid()::text,
	d."workspace_id",
	d."id",
	d."created_by_id",
	d."name",
	COALESCE(d."config", '{}'::jsonb) - 'linkedDatabaseViews' - 'hiddenViewIds',
	d."version",
	d."deleted_by_id",
	d."deleted_at",
	d."created_at",
	d."updated_at"
FROM "database" d;
--> statement-breakpoint
INSERT INTO "database_data_source" (
	"database_id", "data_source_id", "position", "linked_by_id", "created_at", "updated_at"
)
SELECT
	ds."parent_database_id",
	ds."id",
	0,
	ds."created_by_id",
	ds."created_at",
	ds."updated_at"
FROM "data_source" ds;
--> statement-breakpoint
UPDATE "database_view" v
SET "data_source_id" = ds."id"
FROM "data_source" ds
WHERE ds."parent_database_id" = v."database_id";
--> statement-breakpoint
UPDATE "database_property" p
SET "data_source_id" = ds."id"
FROM "data_source" ds
WHERE ds."parent_database_id" = p."database_id";
--> statement-breakpoint
UPDATE "database_row" r
SET "data_source_id" = ds."id"
FROM "data_source" ds
WHERE ds."parent_database_id" = r."database_id";
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM (
			SELECT linked."source_database_id"
			FROM "database" host
			CROSS JOIN LATERAL jsonb_array_elements(
				CASE
					WHEN jsonb_typeof(host."config"->'linkedDatabaseViews') = 'array'
					THEN host."config"->'linkedDatabaseViews'
					ELSE '[]'::jsonb
				END
			) entry
			CROSS JOIN LATERAL (
				SELECT entry->>'databaseId' AS "source_database_id"
			) linked
			WHERE entry->>'sourceKind' = 'source'
			GROUP BY linked."source_database_id"
			HAVING count(DISTINCT host."id") > 1
		) ambiguous
	) THEN
		RAISE EXCEPTION 'A legacy source is owned by more than one host database; resolve source ownership before applying migration 0049.';
	END IF;
END $$;
--> statement-breakpoint
WITH legacy_links AS (
	SELECT DISTINCT
		host."id" AS "host_database_id",
		entry->>'databaseId' AS "source_database_id"
	FROM "database" host
	CROSS JOIN LATERAL jsonb_array_elements(
		CASE
			WHEN jsonb_typeof(host."config"->'linkedDatabaseViews') = 'array'
			THEN host."config"->'linkedDatabaseViews'
			ELSE '[]'::jsonb
		END
	) entry
	WHERE nullif(entry->>'databaseId', '') IS NOT NULL
)
INSERT INTO "database_data_source" (
	"database_id", "data_source_id", "position", "created_at", "updated_at"
)
SELECT
	links."host_database_id",
	ds."id",
	COALESCE((
		SELECT max(existing."position") + 1
		FROM "database_data_source" existing
		WHERE existing."database_id" = links."host_database_id"
	), 0),
	now(),
	now()
FROM legacy_links links
JOIN "data_source" ds ON ds."parent_database_id" = links."source_database_id"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
WITH source_owners AS (
	SELECT
		entry->>'databaseId' AS "source_database_id",
		min(host."id") AS "host_database_id"
	FROM "database" host
	CROSS JOIN LATERAL jsonb_array_elements(
		CASE
			WHEN jsonb_typeof(host."config"->'linkedDatabaseViews') = 'array'
			THEN host."config"->'linkedDatabaseViews'
			ELSE '[]'::jsonb
		END
	) entry
	WHERE entry->>'sourceKind' = 'source'
	GROUP BY entry->>'databaseId'
)
UPDATE "data_source" ds
SET "parent_database_id" = owners."host_database_id", "updated_at" = now()
FROM source_owners owners
WHERE ds."parent_database_id" = owners."source_database_id";
--> statement-breakpoint
WITH replacements AS (
	SELECT
		host."id" AS "host_database_id",
		entry,
		ds."id" AS "data_source_id"
	FROM "database" host
	CROSS JOIN LATERAL jsonb_array_elements(
		CASE
			WHEN jsonb_typeof(host."config"->'linkedDatabaseViews') = 'array'
			THEN host."config"->'linkedDatabaseViews'
			ELSE '[]'::jsonb
		END
	) entry
	JOIN "data_source" ds ON ds."id" = (
		SELECT binding."data_source_id"
		FROM "database_data_source" binding
		JOIN "data_source" candidate ON candidate."id" = binding."data_source_id"
		WHERE binding."database_id" = host."id"
			AND (
				candidate."parent_database_id" = entry->>'databaseId'
				OR EXISTS (
					SELECT 1 FROM "database_data_source" origin_binding
					WHERE origin_binding."database_id" = entry->>'databaseId'
						AND origin_binding."data_source_id" = candidate."id"
				)
			)
		ORDER BY binding."position"
		LIMIT 1
	)
	WHERE nullif(entry->>'replacedViewId', '') IS NOT NULL
		AND COALESCE((entry->>'hidden')::boolean, false) = false
)
UPDATE "database_view" target
SET
	"data_source_id" = replacements."data_source_id",
	"name" = COALESCE(NULLIF(replacements.entry->>'viewName', ''), source_view."name", target."name"),
	"type" = COALESCE(NULLIF(replacements.entry->>'viewType', ''), source_view."type", target."type"),
	"config" = COALESCE(source_view."config", target."config"),
	"updated_at" = now()
FROM replacements
LEFT JOIN "database_view" source_view
	ON source_view."id" = replacements.entry->>'viewId'
WHERE target."database_id" = replacements."host_database_id"
	AND target."id" = replacements.entry->>'replacedViewId';
--> statement-breakpoint
WITH linked_views AS (
	SELECT
		host."id" AS "host_database_id",
		entry,
		binding."data_source_id",
		row_number() OVER (PARTITION BY host."id" ORDER BY items.ordinality) - 1 AS "ordinal"
	FROM "database" host
	CROSS JOIN LATERAL jsonb_array_elements(
		CASE
			WHEN jsonb_typeof(host."config"->'linkedDatabaseViews') = 'array'
			THEN host."config"->'linkedDatabaseViews'
			ELSE '[]'::jsonb
		END
	) WITH ORDINALITY AS items(entry, ordinality)
	JOIN LATERAL (
		SELECT association."data_source_id"
		FROM "database_data_source" association
		JOIN "data_source" candidate ON candidate."id" = association."data_source_id"
		WHERE association."database_id" = host."id"
			AND (
				candidate."parent_database_id" = entry->>'databaseId'
				OR EXISTS (
					SELECT 1 FROM "database_data_source" origin_binding
					WHERE origin_binding."database_id" = entry->>'databaseId'
						AND origin_binding."data_source_id" = candidate."id"
				)
			)
		ORDER BY association."position"
		LIMIT 1
	) binding ON true
	WHERE COALESCE((entry->>'hidden')::boolean, false) = false
		AND nullif(entry->>'replacedViewId', '') IS NULL
), trailing_positions AS (
	SELECT "database_id", COALESCE(max("position") + 1, 0) AS "next_position"
	FROM "database_view"
	GROUP BY "database_id"
)
INSERT INTO "database_view" (
	"id", "database_id", "data_source_id", "type", "name", "config", "position", "created_at", "updated_at"
)
SELECT
	COALESCE(NULLIF(linked.entry->>'linkedViewId', ''), gen_random_uuid()::text),
	linked."host_database_id",
	linked."data_source_id",
	COALESCE(NULLIF(linked.entry->>'viewType', ''), source_view."type", 'table'),
	COALESCE(NULLIF(linked.entry->>'viewName', ''), source_view."name", 'Table'),
	source_view."config",
	COALESCE(positions."next_position", 0) + linked."ordinal"::integer,
	now(),
	now()
FROM linked_views linked
LEFT JOIN "database_view" source_view ON source_view."id" = linked.entry->>'viewId'
LEFT JOIN trailing_positions positions ON positions."database_id" = linked."host_database_id";
--> statement-breakpoint
DELETE FROM "database_view" hidden_view
USING "database" host
WHERE hidden_view."database_id" = host."id"
	AND EXISTS (
		SELECT 1
		FROM jsonb_array_elements_text(
			CASE
				WHEN jsonb_typeof(host."config"->'hiddenViewIds') = 'array'
				THEN host."config"->'hiddenViewIds'
				ELSE '[]'::jsonb
			END
		) hidden_id
		WHERE hidden_id = hidden_view."id"
	)
	AND NOT EXISTS (
		SELECT 1
		FROM jsonb_array_elements(
			CASE
				WHEN jsonb_typeof(host."config"->'linkedDatabaseViews') = 'array'
				THEN host."config"->'linkedDatabaseViews'
				ELSE '[]'::jsonb
			END
		) replacement
		WHERE replacement->>'replacedViewId' = hidden_view."id"
			AND COALESCE((replacement->>'hidden')::boolean, false) = false
	);
--> statement-breakpoint
UPDATE "database"
SET "config" = COALESCE("config", '{}'::jsonb) - 'linkedDatabaseViews' - 'hiddenViewIds';
--> statement-breakpoint
ALTER TABLE "database_property" DROP CONSTRAINT IF EXISTS "database_property_database_id_database_id_fk";
--> statement-breakpoint
ALTER TABLE "database_row" DROP CONSTRAINT IF EXISTS "database_row_database_id_database_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "database_property_position_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "database_property_database_property_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "database_row_database_deleted_position_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "database_row_parent_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "database_row_position_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "database_row_database_page_unique";
--> statement-breakpoint
ALTER TABLE "database_property" DROP COLUMN "database_id";
--> statement-breakpoint
ALTER TABLE "database_row" DROP COLUMN "database_id";
--> statement-breakpoint
ALTER TABLE "database_view" ALTER COLUMN "data_source_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "database_property" ALTER COLUMN "data_source_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "database_row" ALTER COLUMN "data_source_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "data_source" ADD CONSTRAINT "data_source_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "data_source" ADD CONSTRAINT "data_source_parent_database_id_database_id_fk" FOREIGN KEY ("parent_database_id") REFERENCES "public"."database"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "data_source" ADD CONSTRAINT "data_source_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "data_source" ADD CONSTRAINT "data_source_deleted_by_id_user_id_fk" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "database_data_source" ADD CONSTRAINT "database_data_source_database_id_database_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."database"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "database_data_source" ADD CONSTRAINT "database_data_source_data_source_id_data_source_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_source"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "database_data_source" ADD CONSTRAINT "database_data_source_linked_by_id_user_id_fk" FOREIGN KEY ("linked_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "database_view" ADD CONSTRAINT "database_view_data_source_id_data_source_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_source"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "database_property" ADD CONSTRAINT "database_property_data_source_id_data_source_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_source"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "database_row" ADD CONSTRAINT "database_row_data_source_id_data_source_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_source"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "data_source_workspace_deleted_idx" ON "data_source" USING btree ("workspace_id", "deleted_at");
--> statement-breakpoint
CREATE INDEX "data_source_parent_database_idx" ON "data_source" USING btree ("parent_database_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "database_data_source_unique" ON "database_data_source" USING btree ("database_id", "data_source_id");
--> statement-breakpoint
CREATE INDEX "database_data_source_position_idx" ON "database_data_source" USING btree ("database_id", "position");
--> statement-breakpoint
CREATE INDEX "database_data_source_source_idx" ON "database_data_source" USING btree ("data_source_id");
--> statement-breakpoint
CREATE INDEX "database_view_data_source_idx" ON "database_view" USING btree ("data_source_id");
--> statement-breakpoint
ALTER TABLE "database_view" ADD CONSTRAINT "database_view_database_data_source_fk" FOREIGN KEY ("database_id", "data_source_id") REFERENCES "public"."database_data_source"("database_id", "data_source_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "database_property_position_idx" ON "database_property" USING btree ("data_source_id", "position");
--> statement-breakpoint
CREATE UNIQUE INDEX "database_property_database_property_unique" ON "database_property" USING btree ("data_source_id", "property_id");
--> statement-breakpoint
CREATE INDEX "database_row_database_deleted_position_idx" ON "database_row" USING btree ("data_source_id", "deleted_at", "position");
--> statement-breakpoint
CREATE INDEX "database_row_parent_idx" ON "database_row" USING btree ("data_source_id", "parent_row_id");
--> statement-breakpoint
CREATE INDEX "database_row_position_idx" ON "database_row" USING btree ("data_source_id", "position");
--> statement-breakpoint
CREATE UNIQUE INDEX "database_row_database_page_unique" ON "database_row" USING btree ("data_source_id", "page_id");
