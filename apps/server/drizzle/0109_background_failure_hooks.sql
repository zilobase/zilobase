ALTER TABLE background_dispatch ADD COLUMN failure_handled_at timestamptz;
--> statement-breakpoint
ALTER TABLE database_realtime_outbox ADD COLUMN failed_at timestamptz;
--> statement-breakpoint
ALTER TABLE in_product_notification_outbox DROP CONSTRAINT in_product_notification_outbox_status_check;
--> statement-breakpoint
ALTER TABLE in_product_notification_outbox ADD CONSTRAINT in_product_notification_outbox_status_check CHECK (status IN ('pending','published','failed'));
