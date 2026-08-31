CREATE TABLE "gmail_send_operation" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"rfc_message_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"gmail_message_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "gmail_send_operation_status_check" CHECK ("gmail_send_operation"."status" in ('pending', 'ambiguous', 'sent', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "gmail_send_operation" ADD CONSTRAINT "gmail_send_operation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gmail_send_operation" ADD CONSTRAINT "gmail_send_operation_connection_id_gmail_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."gmail_connection"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "gmail_send_operation_connection_idx" ON "gmail_send_operation" USING btree ("connection_id");
--> statement-breakpoint
CREATE INDEX "gmail_send_operation_expiry_idx" ON "gmail_send_operation" USING btree ("expires_at");
