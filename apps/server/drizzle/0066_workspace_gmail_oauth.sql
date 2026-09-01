ALTER TABLE "gmail_oauth_attempt" ADD COLUMN "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "gmail_oauth_attempt" ADD CONSTRAINT "gmail_oauth_attempt_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "gmail_oauth_attempt_workspace_idx" ON "gmail_oauth_attempt" USING btree ("workspace_id", "expires_at");
--> statement-breakpoint
ALTER TABLE "gmail_send_operation" DROP CONSTRAINT "gmail_send_operation_connection_id_gmail_connection_id_fk";
--> statement-breakpoint
ALTER TABLE "gmail_send_operation" ADD CONSTRAINT "gmail_send_operation_connection_id_gmail_account_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."gmail_account"("id") ON DELETE cascade ON UPDATE no action;
