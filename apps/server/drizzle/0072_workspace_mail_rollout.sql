DELETE FROM "gmail_oauth_attempt" WHERE "workspace_id" IS NULL;
ALTER TABLE "gmail_oauth_attempt" ALTER COLUMN "workspace_id" SET NOT NULL;
DROP TABLE "gmail_connection";
