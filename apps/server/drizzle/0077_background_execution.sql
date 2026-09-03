ALTER TABLE "database_automation_run"
  ADD COLUMN "available_at" timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
DROP INDEX IF EXISTS "database_automation_run_claim_idx";
--> statement-breakpoint
CREATE INDEX "database_automation_run_claim_idx"
  ON "database_automation_run" ("status", "available_at", "lease_expires_at", "workspace_id", "created_at")
  WHERE "status" IN ('queued', 'running');
--> statement-breakpoint
CREATE INDEX "database_automation_event_window_active_due_idx"
  ON "database_automation_event_window" ("closes_at", "next_attempt_at", "lease_expires_at")
  WHERE "status" IN ('accumulating', 'ready', 'processing');
--> statement-breakpoint
CREATE INDEX "ai_job_active_due_idx"
  ON "ai_job" ("available_at", "lease_expires_at", "created_at")
  WHERE "status" IN ('queued', 'running');
--> statement-breakpoint
CREATE INDEX "mail_index_state_active_due_idx"
  ON "mail_index_state" ("status", "lease_expires_at", "updated_at")
  WHERE "status" IN ('pending', 'backfilling', 'syncing', 'error');
--> statement-breakpoint
CREATE INDEX "mail_database_sync_outbox_active_due_idx"
  ON "mail_database_sync_outbox" ("next_attempt_at", "lease_expires_at", "created_at")
  WHERE "status" IN ('pending', 'processing', 'retry');
--> statement-breakpoint
CREATE INDEX "in_product_notification_outbox_pending_due_idx"
  ON "in_product_notification_outbox" ("next_attempt_at", "created_at")
  WHERE "status" = 'pending';
--> statement-breakpoint
CREATE TABLE "background_maintenance_task" (
  "task_key" text PRIMARY KEY NOT NULL,
  "next_run_at" timestamptz NOT NULL,
  "lease_owner" text,
  "lease_expires_at" timestamptz,
  "last_started_at" timestamptz,
  "last_succeeded_at" timestamptz,
  "last_failed_at" timestamptz,
  "last_error_code" varchar(80),
  "consecutive_failures" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX "background_maintenance_task_due_idx"
  ON "background_maintenance_task" ("next_run_at", "lease_expires_at");
--> statement-breakpoint
INSERT INTO "background_maintenance_task" ("task_key", "next_run_at", "created_at", "updated_at")
VALUES
  ('background.reconcile', now(), now(), now()),
  ('automation.schedules', now(), now(), now()),
  ('membership.expiry', now(), now(), now()),
  ('mail.index_recovery', now(), now(), now()),
  ('gmail.watch_renewal', now(), now(), now()),
  ('ai.cleanup', now(), now(), now()),
  ('automation.retention', now(), now(), now()),
  ('gmail.send_receipt_cleanup', now(), now(), now()),
  ('background.snapshot', now(), now(), now())
ON CONFLICT ("task_key") DO NOTHING;
