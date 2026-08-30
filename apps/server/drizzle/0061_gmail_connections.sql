CREATE TABLE "gmail_connection" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "google_subject" text NOT NULL,
  "email" text NOT NULL,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "refresh_token_ciphertext" text NOT NULL,
  "refresh_token_iv" text NOT NULL,
  "refresh_token_key_version" text NOT NULL,
  "status" text DEFAULT 'connected' NOT NULL,
  "notification_history_id" text,
  "mailbox_revision" integer DEFAULT 0 NOT NULL,
  "watch_expires_at" timestamp with time zone,
  "last_watch_at" timestamp with time zone,
  "last_error_code" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "gmail_connection_status_check" CHECK ("status" in ('connected', 'reconnect_required'))
);--> statement-breakpoint
CREATE TABLE "gmail_oauth_attempt" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "state_hash" text NOT NULL,
  "code_verifier_ciphertext" text NOT NULL,
  "code_verifier_iv" text NOT NULL,
  "code_verifier_key_version" text NOT NULL,
  "client_kind" text NOT NULL,
  "return_path" text DEFAULT '/mail' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "gmail_oauth_attempt_client_kind_check" CHECK ("client_kind" in ('web', 'desktop'))
);--> statement-breakpoint
ALTER TABLE "gmail_connection" ADD CONSTRAINT "gmail_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gmail_oauth_attempt" ADD CONSTRAINT "gmail_oauth_attempt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gmail_connection_user_unique" ON "gmail_connection" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gmail_connection_google_subject_unique" ON "gmail_connection" USING btree ("google_subject");--> statement-breakpoint
CREATE INDEX "gmail_connection_watch_expiry_idx" ON "gmail_connection" USING btree ("status","watch_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gmail_oauth_attempt_state_unique" ON "gmail_oauth_attempt" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "gmail_oauth_attempt_user_expiry_idx" ON "gmail_oauth_attempt" USING btree ("user_id","expires_at");
