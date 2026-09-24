CREATE TABLE "mail_draft" (
  "id" text PRIMARY KEY NOT NULL,
  "gmail_account_id" text NOT NULL,
  "gmail_draft_id" text NOT NULL,
  "gmail_message_id" text NOT NULL,
  "gmail_thread_id" text NOT NULL,
  "client_draft_id" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "provider_written_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_draft" ADD CONSTRAINT "mail_draft_gmail_account_id_gmail_account_id_fk" FOREIGN KEY ("gmail_account_id") REFERENCES "public"."gmail_account"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "mail_draft_account_draft_unique" ON "mail_draft" USING btree ("gmail_account_id","gmail_draft_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "mail_draft_account_message_unique" ON "mail_draft" USING btree ("gmail_account_id","gmail_message_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "mail_draft_account_client_unique" ON "mail_draft" USING btree ("gmail_account_id","client_draft_id");
--> statement-breakpoint
CREATE INDEX "mail_draft_account_thread_idx" ON "mail_draft" USING btree ("gmail_account_id","gmail_thread_id");
