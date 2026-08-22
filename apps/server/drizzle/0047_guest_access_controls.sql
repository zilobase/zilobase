ALTER TABLE "workspace"
ADD COLUMN "guest_invite_mode" text DEFAULT 'direct' NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspace"
ADD CONSTRAINT "workspace_guest_invite_mode_check"
CHECK ("guest_invite_mode" in ('direct', 'request', 'owners_only'));
--> statement-breakpoint
ALTER TABLE "page_guest_invitation"
DROP CONSTRAINT "page_guest_invitation_access_level_check";
--> statement-breakpoint
ALTER TABLE "page_guest_invitation"
ADD CONSTRAINT "page_guest_invitation_access_level_check"
CHECK ("access_level" in ('view', 'comment', 'edit', 'full'));
--> statement-breakpoint
CREATE TABLE "page_guest_request" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"page_id" text NOT NULL,
	"email" text NOT NULL,
	"access_level" text DEFAULT 'view' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requester_id" text NOT NULL,
	"reviewer_id" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_guest_request_access_level_check" CHECK ("access_level" in ('view', 'comment', 'edit', 'full')),
	CONSTRAINT "page_guest_request_status_check" CHECK ("status" in ('pending', 'approved', 'rejected', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "page_guest_request" ADD CONSTRAINT "page_guest_request_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "page_guest_request" ADD CONSTRAINT "page_guest_request_page_id_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."page"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "page_guest_request" ADD CONSTRAINT "page_guest_request_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "page_guest_request" ADD CONSTRAINT "page_guest_request_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "page_guest_request_workspace_status_idx" ON "page_guest_request" USING btree ("workspace_id","status");
--> statement-breakpoint
CREATE INDEX "page_guest_request_page_status_idx" ON "page_guest_request" USING btree ("page_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "page_guest_request_pending_unique" ON "page_guest_request" USING btree ("page_id",lower("email")) WHERE "status" = 'pending';
