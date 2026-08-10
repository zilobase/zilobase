UPDATE "page_property"
SET
  "config" = COALESCE("config", '{}'::jsonb) || jsonb_build_object(
    'relation',
    COALESCE("config" -> 'relation', '{}'::jsonb) || '{"limit":"one_page"}'::jsonb
  ),
  "updated_at" = now()
WHERE
  "type" = 'relation'
  AND "config" #>> '{subItems,role}' = 'parent-item';
--> statement-breakpoint
UPDATE "page_property"
SET
  "config" = COALESCE("config", '{}'::jsonb) || jsonb_build_object(
    'relation',
    COALESCE("config" -> 'relation', '{}'::jsonb) || '{"limit":"no_limit"}'::jsonb
  ),
  "updated_at" = now()
WHERE
  "type" = 'relation'
  AND "config" #>> '{subItems,role}' = 'sub-item';
--> statement-breakpoint
UPDATE "page_property_value" AS "parent_value"
SET
  "value" = "parent_value"."value" -> 0,
  "updated_at" = now()
FROM "page_property" AS "parent_property"
WHERE
  "parent_value"."property_id" = "parent_property"."id"
  AND "parent_property"."config" #>> '{subItems,role}' = 'parent-item'
  AND jsonb_typeof("parent_value"."value") = 'array';
--> statement-breakpoint
UPDATE "page_property_value" AS "sub_item_value"
SET
  "value" = COALESCE(
    (
      SELECT jsonb_agg(
        "parent_value"."page_id"
        ORDER BY "parent_value"."created_at", "parent_value"."page_id"
      )
      FROM "page_property" AS "parent_property"
      INNER JOIN "page_property_value" AS "parent_value"
        ON "parent_value"."property_id" = "parent_property"."id"
      WHERE
        "parent_property"."config" #>> '{subItems,role}' = 'parent-item'
        AND "parent_property"."config" #>> '{relation,relatedPropertyId}' = "sub_item_value"."property_id"
        AND "parent_value"."value" #>> '{}' = "sub_item_value"."page_id"
    ),
    '[]'::jsonb
  ),
  "updated_at" = now()
FROM "page_property" AS "sub_item_property"
WHERE
  "sub_item_value"."property_id" = "sub_item_property"."id"
  AND "sub_item_property"."config" #>> '{subItems,role}' = 'sub-item';
