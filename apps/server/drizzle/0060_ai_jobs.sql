CREATE TABLE "ai_job" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "user_id" text,
  "type" text NOT NULL,
  "dedupe_key" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "input" jsonb NOT NULL,
  "output" jsonb,
  "error" text,
  "progress" integer DEFAULT 0 NOT NULL,
  "attempt" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "available_at" timestamp with time zone NOT NULL,
  "leased_at" timestamp with time zone,
  "lease_expires_at" timestamp with time zone,
  "worker_id" text,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "ai_job_status_check" CHECK ("status" in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  CONSTRAINT "ai_job_progress_check" CHECK ("progress" between 0 and 100)
);--> statement-breakpoint
ALTER TABLE "ai_job" ADD CONSTRAINT "ai_job_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job" ADD CONSTRAINT "ai_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_job_dedupe_unique" ON "ai_job" USING btree ("workspace_id","type","dedupe_key");--> statement-breakpoint
CREATE INDEX "ai_job_claim_idx" ON "ai_job" USING btree ("status","available_at","lease_expires_at");--> statement-breakpoint
CREATE INDEX "ai_job_owner_created_idx" ON "ai_job" USING btree ("workspace_id","user_id","created_at");
