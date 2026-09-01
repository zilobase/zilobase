CREATE TABLE "mail_reminder" (
	"id" text PRIMARY KEY NOT NULL,
	"binding_id" text NOT NULL,
	"gmail_thread_id" text NOT NULL,
	"remind_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"fired_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mail_reminder_status_check" CHECK ("mail_reminder"."status" in ('pending', 'fired', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "mail_reminder" ADD CONSTRAINT "mail_reminder_binding_id_gmail_workspace_connection_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."gmail_workspace_connection"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "mail_reminder_binding_thread_unique" ON "mail_reminder" USING btree ("binding_id", "gmail_thread_id");
--> statement-breakpoint
CREATE INDEX "mail_reminder_due_idx" ON "mail_reminder" USING btree ("status", "remind_at");
