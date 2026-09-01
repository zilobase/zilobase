CREATE TABLE "mail_index_state" (
	"gmail_account_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"indexed_thread_count" integer DEFAULT 0 NOT NULL,
	"result_size_estimate" integer,
	"history_id" text,
	"history_start_id" text,
	"history_page_token" text,
	"next_page_token" text,
	"last_error_code" text,
	"lease_expires_at" timestamp with time zone,
	"lease_token" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_thread_index" (
	"id" text PRIMARY KEY NOT NULL,
	"gmail_account_id" text NOT NULL,
	"gmail_thread_id" text NOT NULL,
	"generation" integer NOT NULL,
	"latest_message_id" text NOT NULL,
	"message_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"label_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"from_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"to_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cc_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bcc_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text NOT NULL,
	"internal_date" bigint NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"message_count" integer NOT NULL,
	"attachment_count" integer NOT NULL,
	"has_calendar_event" boolean DEFAULT false NOT NULL,
	"unread" boolean DEFAULT false NOT NULL,
	"starred" boolean DEFAULT false NOT NULL,
	"important" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_index_state" ADD CONSTRAINT "mail_index_state_gmail_account_id_gmail_account_id_fk" FOREIGN KEY ("gmail_account_id") REFERENCES "public"."gmail_account"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mail_thread_index" ADD CONSTRAINT "mail_thread_index_gmail_account_id_gmail_account_id_fk" FOREIGN KEY ("gmail_account_id") REFERENCES "public"."gmail_account"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "mail_thread_index_account_thread_unique" ON "mail_thread_index" USING btree ("gmail_account_id", "gmail_thread_id");
--> statement-breakpoint
CREATE INDEX "mail_thread_index_account_date_idx" ON "mail_thread_index" USING btree ("gmail_account_id", "internal_date");
--> statement-breakpoint
CREATE INDEX "mail_thread_index_account_unread_idx" ON "mail_thread_index" USING btree ("gmail_account_id", "unread");
--> statement-breakpoint
CREATE INDEX "mail_thread_index_account_starred_idx" ON "mail_thread_index" USING btree ("gmail_account_id", "starred");
