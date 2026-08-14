ALTER TABLE "instance_settings" ADD COLUMN "registration_mode" text DEFAULT 'invite-only' NOT NULL;
--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "pinned_workspace_id" text;
--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "bootstrap_completed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "instance_settings" ADD CONSTRAINT "instance_settings_registration_mode_check" CHECK ("registration_mode" in ('invite-only', 'open'));
--> statement-breakpoint
ALTER TABLE "instance_settings" ADD CONSTRAINT "instance_settings_pinned_workspace_id_workspace_id_fk" FOREIGN KEY ("pinned_workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "instance_settings" (
	"id",
	"instance_id",
	"display_name",
	"registration_mode",
	"pinned_workspace_id",
	"bootstrap_completed_at",
	"created_at",
	"updated_at"
)
SELECT
	'primary',
	gen_random_uuid()::text,
	"workspace"."name",
	'invite-only',
	"workspace"."id",
	now(),
	now(),
	now()
FROM "workspace"
ORDER BY "workspace"."created_at", "workspace"."id"
LIMIT 1
ON CONFLICT ("id") DO UPDATE SET
	"pinned_workspace_id" = COALESCE(
		"instance_settings"."pinned_workspace_id",
		EXCLUDED."pinned_workspace_id"
	),
	"bootstrap_completed_at" = COALESCE(
		"instance_settings"."bootstrap_completed_at",
		EXCLUDED."bootstrap_completed_at"
	),
	"updated_at" = now();
--> statement-breakpoint
DROP INDEX IF EXISTS "member_workspace_user_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "member_workspace_user_unique" ON "member" USING btree ("workspace_id", "user_id");
