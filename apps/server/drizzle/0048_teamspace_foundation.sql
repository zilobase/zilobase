ALTER TABLE "workspace"
ADD COLUMN "teamspace_creation_policy" text DEFAULT 'workspace_members' NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspace"
ADD CONSTRAINT "workspace_teamspace_creation_policy_check"
CHECK ("teamspace_creation_policy" in ('workspace_owners', 'workspace_members'));
--> statement-breakpoint
CREATE TABLE "teamspace" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" jsonb,
	"access_mode" text DEFAULT 'closed' NOT NULL,
	"member_access_level" text DEFAULT 'edit' NOT NULL,
	"invite_policy" text DEFAULT 'owners_and_members' NOT NULL,
	"sidebar_edit_policy" text DEFAULT 'owners_and_members' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"invite_link_enabled" boolean DEFAULT false NOT NULL,
	"invite_link_token_hash" text,
	"guests_enabled" boolean DEFAULT true NOT NULL,
	"public_sharing_enabled" boolean DEFAULT true NOT NULL,
	"export_enabled" boolean DEFAULT true NOT NULL,
	"created_by_id" text,
	"archived_by_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teamspace_access_mode_check" CHECK ("access_mode" in ('open', 'closed', 'private')),
	CONSTRAINT "teamspace_member_access_level_check" CHECK ("member_access_level" in ('view', 'comment', 'edit', 'full')),
	CONSTRAINT "teamspace_invite_policy_check" CHECK ("invite_policy" in ('owners', 'owners_and_members')),
	CONSTRAINT "teamspace_sidebar_edit_policy_check" CHECK ("sidebar_edit_policy" in ('owners', 'owners_and_members')),
	CONSTRAINT "teamspace_invite_link_state_check" CHECK (not "invite_link_enabled" or "invite_link_token_hash" is not null)
);
--> statement-breakpoint
CREATE TABLE "teamspace_principal" (
	"id" text PRIMARY KEY NOT NULL,
	"teamspace_id" text NOT NULL,
	"principal_type" text NOT NULL,
	"principal_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"membership_source" text DEFAULT 'explicit' NOT NULL,
	"access_level_override" text,
	"added_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teamspace_principal_type_check" CHECK ("principal_type" in ('user', 'team')),
	CONSTRAINT "teamspace_principal_role_check" CHECK ("role" in ('owner', 'member')),
	CONSTRAINT "teamspace_principal_membership_source_check" CHECK ("membership_source" in ('creator', 'explicit', 'default', 'self_join', 'invite_link', 'group')),
	CONSTRAINT "teamspace_principal_access_override_check" CHECK ("access_level_override" is null or "access_level_override" in ('view', 'comment', 'edit', 'full'))
);
--> statement-breakpoint
ALTER TABLE "teamspace" ADD CONSTRAINT "teamspace_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "teamspace" ADD CONSTRAINT "teamspace_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "teamspace" ADD CONSTRAINT "teamspace_archived_by_id_user_id_fk" FOREIGN KEY ("archived_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "teamspace_principal" ADD CONSTRAINT "teamspace_principal_teamspace_id_teamspace_id_fk" FOREIGN KEY ("teamspace_id") REFERENCES "public"."teamspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "teamspace_principal" ADD CONSTRAINT "teamspace_principal_added_by_id_user_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "teamspace_workspace_archived_updated_idx" ON "teamspace" USING btree ("workspace_id", "archived_at", "updated_at");
--> statement-breakpoint
CREATE INDEX "teamspace_workspace_default_idx" ON "teamspace" USING btree ("workspace_id", "is_default");
--> statement-breakpoint
CREATE UNIQUE INDEX "teamspace_workspace_active_name_unique" ON "teamspace" USING btree ("workspace_id", lower("name")) WHERE "archived_at" is null;
--> statement-breakpoint
CREATE UNIQUE INDEX "teamspace_invite_link_token_hash_unique" ON "teamspace" USING btree ("invite_link_token_hash") WHERE "invite_link_token_hash" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "teamspace_principal_unique" ON "teamspace_principal" USING btree ("teamspace_id", "principal_type", "principal_id");
--> statement-breakpoint
CREATE INDEX "teamspace_principal_lookup_idx" ON "teamspace_principal" USING btree ("principal_type", "principal_id");
--> statement-breakpoint
CREATE INDEX "teamspace_principal_teamspace_role_idx" ON "teamspace_principal" USING btree ("teamspace_id", "role");
--> statement-breakpoint
INSERT INTO "teamspace" (
	"id", "workspace_id", "name", "access_mode", "is_default", "created_by_id"
)
SELECT
	gen_random_uuid()::text,
	w."id",
	'General',
	'closed',
	true,
	(
		SELECT m."user_id"
		FROM "member" m
		WHERE m."workspace_id" = w."id" AND m."role" = 'owner'
		ORDER BY m."created_at", m."id"
		LIMIT 1
	)
FROM "workspace" w;
--> statement-breakpoint
INSERT INTO "teamspace_principal" (
	"id", "teamspace_id", "principal_type", "principal_id", "role", "membership_source", "added_by_id"
)
SELECT
	gen_random_uuid()::text,
	ts."id",
	'user',
	m."user_id",
	CASE WHEN m."role" = 'owner' THEN 'owner' ELSE 'member' END,
	'default',
	ts."created_by_id"
FROM "teamspace" ts
JOIN "member" m ON m."workspace_id" = ts."workspace_id"
WHERE ts."is_default" = true
	AND (m."role" <> 'temporary' OR m."access_expires_at" > now())
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "page" ADD COLUMN "teamspace_id" text;
--> statement-breakpoint
ALTER TABLE "page" ADD CONSTRAINT "page_teamspace_id_teamspace_id_fk" FOREIGN KEY ("teamspace_id") REFERENCES "public"."teamspace"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "page_workspace_teamspace_deleted_idx" ON "page" USING btree ("workspace_id", "teamspace_id", "deleted_at");
--> statement-breakpoint
ALTER TABLE "database" ADD COLUMN "teamspace_id" text;
--> statement-breakpoint
ALTER TABLE "database" ADD CONSTRAINT "database_teamspace_id_teamspace_id_fk" FOREIGN KEY ("teamspace_id") REFERENCES "public"."teamspace"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "database_workspace_teamspace_deleted_idx" ON "database" USING btree ("workspace_id", "teamspace_id", "deleted_at");
