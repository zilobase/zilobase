ALTER TABLE "database" ADD COLUMN "created_by_id" text;
--> statement-breakpoint
ALTER TABLE "database" ALTER COLUMN "page_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "database" ADD CONSTRAINT "database_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "database_access" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"database_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"access_level" text DEFAULT 'view' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "database_access" ADD CONSTRAINT "database_access_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "database_access" ADD CONSTRAINT "database_access_database_id_database_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."database"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "database_access_workspace_id_idx" ON "database_access" USING btree ("workspace_id");
CREATE INDEX "database_access_database_id_idx" ON "database_access" USING btree ("database_id");
CREATE INDEX "database_access_target_idx" ON "database_access" USING btree ("workspace_id", "target_type", "target_id");
CREATE UNIQUE INDEX "database_access_target_unique" ON "database_access" USING btree ("database_id", "target_type", "target_id");
--> statement-breakpoint
UPDATE "database" AS d
SET "created_by_id" = p."created_by_id"
FROM "page" AS p
WHERE d."page_id" = p."id";
--> statement-breakpoint
INSERT INTO "database_access" ("id", "workspace_id", "database_id", "target_type", "target_id", "access_level", "created_at", "updated_at")
SELECT 'migrated:' || d."id" || ':' || pa."target_type" || ':' || pa."target_id", d."workspace_id", d."id", pa."target_type", pa."target_id", pa."access_level", pa."created_at", pa."updated_at"
FROM "database" AS d
JOIN "page_access" AS pa ON pa."page_id" = d."page_id"
WHERE NOT (COALESCE(d."config", '{}'::jsonb) ? 'parentItemId')
ON CONFLICT ("database_id", "target_type", "target_id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "database" ADD COLUMN "legacy_host_page_id" text;
--> statement-breakpoint
UPDATE "database"
SET "legacy_host_page_id" = "page_id"
WHERE "page_id" IS NOT NULL
  AND NOT (COALESCE("config", '{}'::jsonb) ? 'parentItemId');
--> statement-breakpoint
UPDATE "database"
SET "page_id" = NULL
WHERE NOT (COALESCE("config", '{}'::jsonb) ? 'parentItemId');
--> statement-breakpoint
DELETE FROM "page" AS p
WHERE p."id" IN (
    SELECT d."legacy_host_page_id"
    FROM "database" AS d
    WHERE d."legacy_host_page_id" IS NOT NULL
  )
  AND NOT EXISTS (SELECT 1 FROM "database" AS d WHERE d."page_id" = p."id")
  AND NOT EXISTS (SELECT 1 FROM "database_row" AS r WHERE r."page_id" = p."id");
--> statement-breakpoint
ALTER TABLE "database" DROP COLUMN "legacy_host_page_id";
