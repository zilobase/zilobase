INSERT INTO "mail_index_state" (
  "gmail_account_id",
  "desired_history_id",
  "committed_revision",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "notification_history_id",
  "mailbox_revision",
  current_timestamp,
  current_timestamp
FROM "gmail_account"
ON CONFLICT ("gmail_account_id") DO UPDATE SET
  "desired_history_id" = CASE
    WHEN excluded."desired_history_id" IS NULL THEN "mail_index_state"."desired_history_id"
    WHEN "mail_index_state"."desired_history_id" IS NULL
      OR "mail_index_state"."desired_history_id"::numeric < excluded."desired_history_id"::numeric
    THEN excluded."desired_history_id"
    ELSE "mail_index_state"."desired_history_id"
  END,
  "committed_revision" = greatest(
    "mail_index_state"."committed_revision",
    excluded."committed_revision"
  );
--> statement-breakpoint
ALTER TABLE "gmail_account" DROP COLUMN "notification_history_id";
--> statement-breakpoint
ALTER TABLE "gmail_account" DROP COLUMN "mailbox_revision";
