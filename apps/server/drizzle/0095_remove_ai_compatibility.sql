DELETE FROM "ai_agent_conversation"
WHERE "visibility" <> 'shared';
--> statement-breakpoint
DROP INDEX IF EXISTS "ai_agent_conversation_shared_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "ai_agent_conversation_legacy_thread_unique";
--> statement-breakpoint
ALTER TABLE "ai_agent_conversation"
  DROP CONSTRAINT IF EXISTS "ai_agent_conversation_visibility_check";
--> statement-breakpoint
ALTER TABLE "ai_agent_conversation"
  DROP COLUMN "visibility",
  DROP COLUMN "legacy_owner_user_id",
  DROP COLUMN "legacy_thread_id";
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_conversation_profile_unique"
  ON "ai_agent_conversation" ("profile_id");
--> statement-breakpoint
ALTER TABLE "workspace_ai_provider_config"
  DROP COLUMN "api_key";
