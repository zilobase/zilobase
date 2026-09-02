CREATE TABLE "slack_oauth_attempt" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "state_hash" text NOT NULL,
  "code_verifier_ciphertext" text NOT NULL,
  "code_verifier_iv" text NOT NULL,
  "code_verifier_key_version" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "slack_oauth_attempt_state_unique" ON "slack_oauth_attempt" ("state_hash");
CREATE INDEX "slack_oauth_attempt_owner_expiry_idx" ON "slack_oauth_attempt" ("workspace_id", "user_id", "expires_at");

CREATE TABLE "slack_connection" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "owner_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "team_id" text NOT NULL,
  "team_name" text NOT NULL,
  "bot_user_id" text NOT NULL,
  "access_token_ciphertext" text NOT NULL,
  "access_token_iv" text NOT NULL,
  "access_token_key_version" text NOT NULL,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'connected' NOT NULL,
  "last_error_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "slack_connection_status_check" CHECK ("status" in ('connected', 'revoked'))
);
CREATE UNIQUE INDEX "slack_connection_owner_team_unique" ON "slack_connection" ("workspace_id", "owner_user_id", "team_id");
CREATE INDEX "slack_connection_workspace_status_idx" ON "slack_connection" ("workspace_id", "status");
