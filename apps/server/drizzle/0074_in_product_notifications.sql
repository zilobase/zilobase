CREATE TABLE "in_product_notification" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "automation_id" text REFERENCES "database_automation"("id") ON DELETE SET NULL,
  "run_id" text REFERENCES "database_automation_run"("id") ON DELETE SET NULL,
  "action_id" text,
  "message" text NOT NULL,
  "page_id" text REFERENCES "page"("id") ON DELETE SET NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "in_product_notification_inbox_idx" ON "in_product_notification" ("workspace_id", "user_id", "created_at");
CREATE INDEX "in_product_notification_unread_idx" ON "in_product_notification" ("workspace_id", "user_id", "read_at");
CREATE UNIQUE INDEX "in_product_notification_run_recipient_unique" ON "in_product_notification" ("run_id", "action_id", "user_id");

CREATE TABLE "in_product_notification_outbox" (
  "id" text PRIMARY KEY NOT NULL,
  "notification_id" text NOT NULL REFERENCES "in_product_notification"("id") ON DELETE CASCADE,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone NOT NULL,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "in_product_notification_outbox_status_check" CHECK ("status" in ('pending', 'published'))
);
CREATE UNIQUE INDEX "in_product_notification_outbox_notification_unique" ON "in_product_notification_outbox" ("notification_id");
CREATE INDEX "in_product_notification_outbox_due_idx" ON "in_product_notification_outbox" ("status", "next_attempt_at");
