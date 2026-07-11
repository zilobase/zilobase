INSERT INTO "page_item_placement" (
	"id",
	"workspace_id",
	"parent_kind",
	"parent_id",
	"item_kind",
	"item_id",
	"placement_kind",
	"source_row_id",
	"position",
	"created_at",
	"updated_at"
)
SELECT
	'migrated:primary:page:' || d."page_id" || ':database:' || d."id",
	d."workspace_id",
	'page',
	d."page_id",
	'database',
	d."id",
	'primary',
	NULL,
	0,
	d."created_at",
	d."updated_at"
FROM "database" AS d
WHERE d."page_id" IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM "page_item_placement" AS placement
		WHERE placement."workspace_id" = d."workspace_id"
			AND placement."item_kind" = 'database'
			AND placement."item_id" = d."id"
			AND placement."placement_kind" = 'primary'
			AND placement."deleted_at" IS NULL
	);
--> statement-breakpoint
UPDATE "database"
SET "config" = COALESCE("config", '{}'::jsonb) - 'parentItemId' - 'parentItemKind'
WHERE COALESCE("config", '{}'::jsonb) ?| ARRAY['parentItemId', 'parentItemKind'];
--> statement-breakpoint
DELETE FROM "page_item_placement"
WHERE (
	("parent_kind" = 'page' AND "parent_id" LIKE 'standalone-database-host:%')
	OR ("item_kind" = 'page' AND "item_id" LIKE 'standalone-database-host:%')
);
--> statement-breakpoint
DELETE FROM "page" AS p
WHERE (p."type" = 'database_host' OR p."id" LIKE 'standalone-database-host:%')
	AND NOT EXISTS (SELECT 1 FROM "database" AS d WHERE d."page_id" = p."id")
	AND NOT EXISTS (SELECT 1 FROM "database_row" AS r WHERE r."page_id" = p."id");
