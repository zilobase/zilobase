CREATE TABLE "database_automation" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "data_source_id" text NOT NULL REFERENCES "data_source"("id") ON DELETE CASCADE,
  "created_by_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "owner_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "current_revision_id" text NOT NULL,
  "create_idempotency_key" text NOT NULL,
  "duplicated_from_id" text,
  "next_run_at" timestamp with time zone,
  "last_run_at" timestamp with time zone,
  "last_run_status" text,
  "error_code" text,
  "error_summary" text,
  "error_action_id" text,
  "errored_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "database_automation_status_check" CHECK ("status" in ('active', 'paused', 'error', 'deleted')),
  CONSTRAINT "database_automation_error_state_check" CHECK (("status" = 'error' and "error_code" is not null and "errored_at" is not null) or ("status" <> 'error' and "error_code" is null and "error_summary" is null and "error_action_id" is null and "errored_at" is null))
);

CREATE TABLE "database_automation_revision" (
  "id" text PRIMARY KEY NOT NULL,
  "automation_id" text NOT NULL REFERENCES "database_automation"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "definition_version" integer NOT NULL,
  "definition" jsonb NOT NULL,
  "compiled_definition" jsonb NOT NULL,
  "definition_hash" text NOT NULL,
  "created_by_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "database_automation_revision_version_check" CHECK ("version" > 0 and "definition_version" > 0)
);

CREATE UNIQUE INDEX "database_automation_revision_automation_id_id_unique" ON "database_automation_revision" ("automation_id", "id");
ALTER TABLE "database_automation"
  ADD CONSTRAINT "database_automation_current_revision_fk"
  FOREIGN KEY ("id", "current_revision_id") REFERENCES "database_automation_revision"("automation_id", "id")
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "database_automation"
  ADD CONSTRAINT "database_automation_duplicated_from_fk"
  FOREIGN KEY ("duplicated_from_id") REFERENCES "database_automation"("id")
  ON DELETE SET NULL;

CREATE INDEX "database_automation_source_status_idx" ON "database_automation" ("data_source_id", "status", "updated_at");
CREATE INDEX "database_automation_workspace_status_idx" ON "database_automation" ("workspace_id", "status", "updated_at");
CREATE INDEX "database_automation_schedule_due_idx" ON "database_automation" ("status", "next_run_at");
CREATE UNIQUE INDEX "database_automation_create_idempotency_unique" ON "database_automation" ("created_by_id", "data_source_id", "create_idempotency_key");
CREATE UNIQUE INDEX "database_automation_revision_version_unique" ON "database_automation_revision" ("automation_id", "version");
CREATE INDEX "database_automation_revision_created_idx" ON "database_automation_revision" ("automation_id", "created_at");

CREATE TABLE "database_automation_dependency" (
  "automation_id" text NOT NULL REFERENCES "database_automation"("id") ON DELETE CASCADE,
  "revision_id" text NOT NULL REFERENCES "database_automation_revision"("id") ON DELETE CASCADE,
  "dependency_type" text NOT NULL,
  "dependency_id" text NOT NULL,
  "usage" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "database_automation_dependency_type_check" CHECK ("dependency_type" in ('data_source', 'database', 'view', 'property', 'user', 'group', 'gmail_connection', 'slack_connection', 'secret'))
);
CREATE UNIQUE INDEX "database_automation_dependency_unique" ON "database_automation_dependency" ("revision_id", "dependency_type", "dependency_id", "usage");
CREATE INDEX "database_automation_dependency_lookup_idx" ON "database_automation_dependency" ("dependency_type", "dependency_id");

CREATE TABLE "database_automation_event_window" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "data_source_id" text NOT NULL REFERENCES "data_source"("id") ON DELETE CASCADE,
  "row_id" text NOT NULL,
  "page_id" text NOT NULL,
  "opened_at" timestamp with time zone NOT NULL,
  "closes_at" timestamp with time zone NOT NULL,
  "last_fact_at" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'accumulating' NOT NULL,
  "row_added" boolean DEFAULT false NOT NULL,
  "changed_property_ids" text[] DEFAULT '{}' NOT NULL,
  "before_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "after_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "actor_ids" text[] DEFAULT '{}' NOT NULL,
  "trigger_actor_id" text,
  "origins" text[] DEFAULT '{}' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone NOT NULL,
  "lease_owner" text,
  "lease_expires_at" timestamp with time zone,
  "terminal_reason" text,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "database_automation_event_window_status_check" CHECK ("status" in ('accumulating', 'ready', 'processing', 'completed', 'discarded'))
);
CREATE INDEX "database_automation_event_window_due_idx" ON "database_automation_event_window" ("status", "closes_at", "next_attempt_at");
CREATE INDEX "database_automation_event_window_source_row_idx" ON "database_automation_event_window" ("data_source_id", "row_id", "status");
CREATE UNIQUE INDEX "database_automation_event_window_accumulating_unique" ON "database_automation_event_window" ("data_source_id", "row_id") WHERE "status" = 'accumulating';

CREATE TABLE "database_automation_run" (
  "id" text PRIMARY KEY NOT NULL,
  "automation_id" text NOT NULL REFERENCES "database_automation"("id") ON DELETE CASCADE,
  "revision_id" text NOT NULL REFERENCES "database_automation_revision"("id") ON DELETE RESTRICT,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "data_source_id" text NOT NULL REFERENCES "data_source"("id") ON DELETE CASCADE,
  "event_window_id" text REFERENCES "database_automation_event_window"("id") ON DELETE SET NULL,
  "trigger_row_id" text,
  "trigger_page_id" text,
  "trigger_actor_id" text,
  "scheduled_for" timestamp with time zone,
  "occurrence_key" text,
  "trigger_time" timestamp with time zone NOT NULL,
  "input_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "definition_hash" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "lease_owner" text,
  "lease_expires_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "error_code" text,
  "error_summary" text,
  "skip_reason" text,
  "summary" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "database_automation_run_status_check" CHECK ("status" in ('queued', 'running', 'succeeded', 'failed', 'skipped', 'cancelled'))
);
CREATE UNIQUE INDEX "database_automation_run_event_unique" ON "database_automation_run" ("event_window_id", "automation_id");
CREATE UNIQUE INDEX "database_automation_run_occurrence_unique" ON "database_automation_run" ("automation_id", "occurrence_key");
CREATE INDEX "database_automation_run_claim_idx" ON "database_automation_run" ("status", "lease_expires_at", "created_at");
CREATE INDEX "database_automation_run_history_idx" ON "database_automation_run" ("automation_id", "created_at");

CREATE TABLE "database_automation_step_run" (
  "id" text PRIMARY KEY NOT NULL,
  "run_id" text NOT NULL REFERENCES "database_automation_run"("id") ON DELETE CASCADE,
  "action_id" text NOT NULL,
  "action_index" integer NOT NULL,
  "idempotency_key" text NOT NULL UNIQUE,
  "status" text DEFAULT 'queued' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "input_summary" jsonb,
  "output_summary" jsonb,
  "error_code" text,
  "error_summary" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "database_automation_step_run_status_check" CHECK ("status" in ('queued', 'running', 'succeeded', 'failed', 'skipped'))
);
CREATE UNIQUE INDEX "database_automation_step_run_action_unique" ON "database_automation_step_run" ("run_id", "action_id");
CREATE INDEX "database_automation_step_run_status_idx" ON "database_automation_step_run" ("run_id", "status", "action_index");

CREATE TABLE "database_automation_delivery" (
  "id" text PRIMARY KEY NOT NULL,
  "run_id" text NOT NULL REFERENCES "database_automation_run"("id") ON DELETE CASCADE,
  "action_id" text NOT NULL,
  "destination_hash" text NOT NULL,
  "kind" text NOT NULL,
  "delivery_id" text NOT NULL UNIQUE,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone,
  "lease_owner" text,
  "lease_expires_at" timestamp with time zone,
  "provider_reference" text,
  "response_status" integer,
  "error_code" text,
  "error_summary" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "database_automation_delivery_kind_check" CHECK ("kind" in ('notification', 'gmail', 'webhook', 'slack')),
  CONSTRAINT "database_automation_delivery_status_check" CHECK ("status" in ('pending', 'sending', 'retrying', 'succeeded', 'failed'))
);
CREATE UNIQUE INDEX "database_automation_delivery_destination_unique" ON "database_automation_delivery" ("run_id", "action_id", "destination_hash");
CREATE INDEX "database_automation_delivery_ready_idx" ON "database_automation_delivery" ("status", "next_attempt_at");

CREATE TABLE "automation_secret" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "owner_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "purpose" text NOT NULL,
  "ciphertext" text NOT NULL,
  "iv" text NOT NULL,
  "key_version" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "automation_secret_workspace_owner_idx" ON "automation_secret" ("workspace_id", "owner_user_id", "created_at");
