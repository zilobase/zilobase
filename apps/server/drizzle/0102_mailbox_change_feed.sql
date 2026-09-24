CREATE TABLE "mail_mailbox_change" (
  "id" text PRIMARY KEY NOT NULL,
  "gmail_account_id" text NOT NULL,
  "revision" integer NOT NULL,
  "message_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "thread_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "labels_changed" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_mailbox_change" ADD CONSTRAINT "mail_mailbox_change_gmail_account_id_gmail_account_id_fk" FOREIGN KEY ("gmail_account_id") REFERENCES "public"."gmail_account"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "mail_mailbox_change_account_revision_unique" ON "mail_mailbox_change" USING btree ("gmail_account_id","revision");
--> statement-breakpoint
CREATE INDEX "mail_mailbox_change_created_idx" ON "mail_mailbox_change" USING btree ("created_at");
