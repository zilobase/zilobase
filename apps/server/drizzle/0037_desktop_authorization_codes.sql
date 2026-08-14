CREATE TABLE "desktop_authorization_code" (
	"id" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"code_challenge" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"user_id" text NOT NULL,
	"active_workspace_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "desktop_authorization_code_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
ALTER TABLE "desktop_authorization_code" ADD CONSTRAINT "desktop_authorization_code_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "desktop_authorization_code_user_id_idx" ON "desktop_authorization_code" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "desktop_authorization_code_expires_at_idx" ON "desktop_authorization_code" USING btree ("expires_at");
