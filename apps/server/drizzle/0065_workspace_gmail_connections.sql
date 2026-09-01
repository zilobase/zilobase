CREATE TABLE "gmail_account" (
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
	CONSTRAINT "gmail_account_status_check" CHECK ("status" in ('connected', 'reconnect_required'))
);
--> statement-breakpoint
ALTER TABLE "gmail_account" ADD CONSTRAINT "gmail_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "gmail_account_owner_subject_unique" ON "gmail_account" USING btree ("user_id", "google_subject");
--> statement-breakpoint
CREATE UNIQUE INDEX "gmail_account_id_user_unique" ON "gmail_account" USING btree ("id", "user_id");
--> statement-breakpoint
CREATE INDEX "gmail_account_email_idx" ON "gmail_account" USING btree ("email");
--> statement-breakpoint
CREATE INDEX "gmail_account_watch_expiry_idx" ON "gmail_account" USING btree ("status", "watch_expires_at");
--> statement-breakpoint
INSERT INTO "gmail_account" (
	"id", "user_id", "google_subject", "email", "scopes",
	"refresh_token_ciphertext", "refresh_token_iv", "refresh_token_key_version",
	"status", "notification_history_id", "mailbox_revision", "watch_expires_at",
	"last_watch_at", "last_error_code", "created_at", "updated_at"
)
SELECT
	"id", "user_id", "google_subject", "email", "scopes",
	"refresh_token_ciphertext", "refresh_token_iv", "refresh_token_key_version",
	'reconnect_required', NULL, "mailbox_revision", NULL,
	NULL, 'legacy_reconnect_required', "created_at", now()
FROM "gmail_connection"
ON CONFLICT ("user_id", "google_subject") DO NOTHING;
--> statement-breakpoint
CREATE TABLE "gmail_workspace_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"gmail_account_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gmail_workspace_connection" ADD CONSTRAINT "gmail_workspace_connection_member_fk" FOREIGN KEY ("workspace_id", "user_id") REFERENCES "public"."member"("workspace_id", "user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gmail_workspace_connection" ADD CONSTRAINT "gmail_workspace_connection_account_owner_fk" FOREIGN KEY ("gmail_account_id", "user_id") REFERENCES "public"."gmail_account"("id", "user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "gmail_workspace_connection_workspace_user_unique" ON "gmail_workspace_connection" USING btree ("workspace_id", "user_id");
--> statement-breakpoint
CREATE INDEX "gmail_workspace_connection_account_idx" ON "gmail_workspace_connection" USING btree ("gmail_account_id");
