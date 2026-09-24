CREATE TABLE "mail_hydration_request" (
  "id" text PRIMARY KEY NOT NULL,
  "gmail_account_id" text NOT NULL,
  "gmail_thread_id" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_error" text,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mail_hydration_request_status_check" CHECK ("status" in ('pending', 'processing', 'retry', 'completed'))
);
--> statement-breakpoint
ALTER TABLE "mail_hydration_request" ADD CONSTRAINT "mail_hydration_request_gmail_account_id_gmail_account_id_fk" FOREIGN KEY ("gmail_account_id") REFERENCES "public"."gmail_account"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "mail_hydration_request_account_thread_unique" ON "mail_hydration_request" USING btree ("gmail_account_id","gmail_thread_id");
--> statement-breakpoint
CREATE INDEX "mail_hydration_request_ready_idx" ON "mail_hydration_request" USING btree ("status","next_attempt_at");
