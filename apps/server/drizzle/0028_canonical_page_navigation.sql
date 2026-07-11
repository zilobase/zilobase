INSERT INTO "page_item_placement" (
	"id", "workspace_id", "parent_kind", "parent_id", "item_kind", "item_id",
	"placement_kind", "source_row_id", "position", "created_at", "updated_at"
)
SELECT
	'migrated:primary-page:' || child."id",
	child."workspace_id",
	'page',
	child."metadata"->>'parentItemId',
	'page',
	child."id",
	'primary',
	NULL,
	0,
	child."created_at",
	child."updated_at"
FROM "page" AS child
WHERE child."metadata"->>'parentItemId' IS NOT NULL
	AND NOT EXISTS (SELECT 1 FROM "database_row" AS row WHERE row."page_id" = child."id")
	AND NOT EXISTS (
		SELECT 1 FROM "page_item_placement" AS placement
		WHERE placement."workspace_id" = child."workspace_id"
			AND placement."item_kind" = 'page'
			AND placement."item_id" = child."id"
			AND placement."placement_kind" = 'primary'
			AND placement."deleted_at" IS NULL
	);
--> statement-breakpoint
INSERT INTO "page_item_placement" (
	"id", "workspace_id", "parent_kind", "parent_id", "item_kind", "item_id",
	"placement_kind", "source_row_id", "position", "created_at", "updated_at"
)
SELECT
	'migrated:linked:' || host."id" || ':' || linked.ordinality || ':'
		|| (linked.item->>'kind') || ':' || (linked.item->>'id'),
	host."workspace_id",
	'page',
	host."id",
	linked.item->>'kind',
	linked.item->>'id',
	'linked',
	NULL,
	(linked.ordinality - 1)::integer,
	host."created_at",
	host."updated_at"
FROM "page" AS host
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(host."metadata"->'linkedItems', '[]'::jsonb))
	WITH ORDINALITY AS linked(item, ordinality)
WHERE linked.item->>'kind' IN ('page', 'database')
	AND COALESCE(linked.item->>'id', '') <> ''
	AND NOT EXISTS (
		SELECT 1 FROM "page_item_placement" AS placement
		WHERE placement."workspace_id" = host."workspace_id"
			AND placement."parent_kind" = 'page'
			AND placement."parent_id" = host."id"
			AND placement."item_kind" = linked.item->>'kind'
			AND placement."item_id" = linked.item->>'id'
			AND placement."placement_kind" = 'linked'
			AND placement."deleted_at" IS NULL
	);
--> statement-breakpoint
INSERT INTO "page_item_placement" (
	"id", "workspace_id", "parent_kind", "parent_id", "item_kind", "item_id",
	"placement_kind", "source_row_id", "position", "created_at", "updated_at"
)
SELECT
	'migrated:database-row:' || row."id",
	d."workspace_id",
	'database',
	row."database_id",
	'page',
	row."page_id",
	'database_row',
	row."id",
	row."position",
	row."created_at",
	row."updated_at"
FROM "database_row" AS row
JOIN "database" AS d ON d."id" = row."database_id"
WHERE NOT EXISTS (
	SELECT 1 FROM "page_item_placement" AS placement
	WHERE placement."source_row_id" = row."id"
		AND placement."placement_kind" = 'database_row'
		AND placement."deleted_at" IS NULL
);
--> statement-breakpoint
UPDATE "page"
SET "metadata" = COALESCE("metadata", '{}'::jsonb)
	- 'parentItemId'
	- 'parentItemKind'
	- 'linkedItems'
WHERE COALESCE("metadata", '{}'::jsonb)
	?| ARRAY['parentItemId', 'parentItemKind', 'linkedItems'];
--> statement-breakpoint
INSERT INTO "page_collaboration_document" ("page_id", "state", "created_at", "updated_at")
SELECT p."id", decode('0000', 'hex'), p."created_at", p."updated_at"
FROM "page" AS p
WHERE NOT EXISTS (
	SELECT 1 FROM "page_collaboration_document" AS document
	WHERE document."page_id" = p."id"
);
--> statement-breakpoint
UPDATE "database"
SET "config" = COALESCE("config", '{}'::jsonb) - 'sort' - 'filter'
WHERE COALESCE("config", '{}'::jsonb) ?| ARRAY['sort', 'filter'];
--> statement-breakpoint
UPDATE "database_view"
SET "config" = COALESCE("config", '{}'::jsonb) - 'sort' - 'filter'
WHERE COALESCE("config", '{}'::jsonb) ?| ARRAY['sort', 'filter'];
