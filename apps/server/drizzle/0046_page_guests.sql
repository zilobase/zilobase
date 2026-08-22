CREATE TABLE "workspace_guest" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"invited_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_guest_invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"page_id" text NOT NULL,
	"email" text NOT NULL,
	"access_level" text DEFAULT 'view' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"inviter_id" text,
	"accepted_by_user_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_guest_invitation_access_level_check" CHECK ("access_level" in ('view', 'edit', 'full')),
	CONSTRAINT "page_guest_invitation_status_check" CHECK ("status" in ('pending', 'accepted', 'cancelled', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "workspace_guest" ADD CONSTRAINT "workspace_guest_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workspace_guest" ADD CONSTRAINT "workspace_guest_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workspace_guest" ADD CONSTRAINT "workspace_guest_invited_by_id_user_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "page_guest_invitation" ADD CONSTRAINT "page_guest_invitation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "page_guest_invitation" ADD CONSTRAINT "page_guest_invitation_page_id_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."page"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "page_guest_invitation" ADD CONSTRAINT "page_guest_invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "page_guest_invitation" ADD CONSTRAINT "page_guest_invitation_accepted_by_user_id_user_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_guest_workspace_user_unique" ON "workspace_guest" USING btree ("workspace_id","user_id");
--> statement-breakpoint
CREATE INDEX "workspace_guest_user_idx" ON "workspace_guest" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "page_guest_invitation_workspace_status_idx" ON "page_guest_invitation" USING btree ("workspace_id","status");
--> statement-breakpoint
CREATE INDEX "page_guest_invitation_page_status_idx" ON "page_guest_invitation" USING btree ("page_id","status");
--> statement-breakpoint
CREATE INDEX "page_guest_invitation_email_idx" ON "page_guest_invitation" USING btree ("email");
--> statement-breakpoint
CREATE UNIQUE INDEX "page_guest_invitation_pending_unique" ON "page_guest_invitation" USING btree ("page_id",lower("email")) WHERE "status" = 'pending';
