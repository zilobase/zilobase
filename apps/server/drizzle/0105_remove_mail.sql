DELETE FROM "background_maintenance_task"
WHERE "task_key" IN ('mail.index_recovery', 'gmail.watch_renewal', 'gmail.send_receipt_cleanup');
--> statement-breakpoint
DELETE FROM "database_automation"
WHERE "id" IN (
  SELECT "automation_id"
  FROM "database_automation_revision"
  WHERE "definition"::text LIKE '%"send_gmail"%'
     OR "compiled_definition"::text LIKE '%"send_gmail"%'
);
--> statement-breakpoint
DELETE FROM "database_automation_dependency"
WHERE "dependency_type" = 'gmail_connection';
--> statement-breakpoint
DELETE FROM "database_automation_delivery"
WHERE "kind" = 'gmail';
--> statement-breakpoint
ALTER TABLE "database_automation_dependency"
  DROP CONSTRAINT "database_automation_dependency_type_check";
--> statement-breakpoint
ALTER TABLE "database_automation_dependency"
  ADD CONSTRAINT "database_automation_dependency_type_check"
  CHECK ("dependency_type" in ('data_source', 'database', 'view', 'property', 'option', 'user', 'group', 'slack_connection', 'secret'));
--> statement-breakpoint
ALTER TABLE "database_automation_delivery"
  DROP CONSTRAINT "database_automation_delivery_kind_check";
--> statement-breakpoint
ALTER TABLE "database_automation_delivery"
  ADD CONSTRAINT "database_automation_delivery_kind_check"
  CHECK ("kind" in ('notification', 'webhook', 'slack'));
--> statement-breakpoint
DROP TABLE IF EXISTS "mail_hydration_request" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "mail_draft" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "mail_mailbox_change" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "mail_database_sync_outbox" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "mail_database_sync_record" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "mail_thread_property_value" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "mail_property" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "mail_reminder" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "mail_view" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "mail_message" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "mail_label" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "mail_thread_index" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "mail_index_state" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "gmail_api_budget" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "gmail_send_operation" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "gmail_workspace_connection" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "gmail_oauth_attempt" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "gmail_account" CASCADE;
