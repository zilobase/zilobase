CREATE TABLE "mail_view" (
	"id" text PRIMARY KEY NOT NULL,
	"binding_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"template_id" text,
	"protected" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_view" ADD CONSTRAINT "mail_view_binding_id_gmail_workspace_connection_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."gmail_workspace_connection"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "mail_view_binding_position_idx" ON "mail_view" USING btree ("binding_id", "position");
--> statement-breakpoint
CREATE INDEX "mail_view_binding_updated_idx" ON "mail_view" USING btree ("binding_id", "updated_at");
