CREATE TABLE "ai_agent_pending_action" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "user_id" text NOT NULL,
  "thread_id" text NOT NULL,
  "tool_call_id" text NOT NULL,
  "tool_name" text NOT NULL,
  "tool_version" integer NOT NULL,
  "tool_input" jsonb NOT NULL,
  "input_hash" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "result" jsonb,
  "error" text,
  "expires_at" timestamp with time zone NOT NULL,
  "approved_at" timestamp with time zone,
  "rejected_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "ai_agent_pending_action_status_check" CHECK ("status" in ('pending', 'executing', 'succeeded', 'failed', 'rejected', 'expired'))
);--> statement-breakpoint
ALTER TABLE "ai_agent_pending_action" ADD CONSTRAINT "ai_agent_pending_action_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_pending_action" ADD CONSTRAINT "ai_agent_pending_action_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_pending_action" ADD CONSTRAINT "ai_agent_pending_action_thread_id_ai_chat_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."ai_chat_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_agent_pending_action_owner_status_idx" ON "ai_agent_pending_action" USING btree ("workspace_id","user_id","thread_id","status");--> statement-breakpoint
CREATE INDEX "ai_agent_pending_action_expiry_idx" ON "ai_agent_pending_action" USING btree ("status","expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_pending_action_thread_call_unique" ON "ai_agent_pending_action" USING btree ("thread_id","tool_call_id");
