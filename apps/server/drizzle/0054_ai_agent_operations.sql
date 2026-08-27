CREATE TABLE "ai_agent_turn" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"requested_model" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"input_message_count" integer DEFAULT 0 NOT NULL,
	"input_character_count" integer DEFAULT 0 NOT NULL,
	"attachment_count" integer DEFAULT 0 NOT NULL,
	"step_count" integer DEFAULT 0 NOT NULL,
	"tool_call_count" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"duration_ms" integer,
	"error_code" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ai_agent_turn_status_check" CHECK ("status" in ('running', 'succeeded', 'failed', 'cancelled', 'rejected')),
	CONSTRAINT "ai_agent_turn_counts_check" CHECK ("input_message_count" >= 0 and "input_character_count" >= 0 and "attachment_count" >= 0 and "step_count" >= 0 and "tool_call_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai_agent_tool_execution" (
	"id" text PRIMARY KEY NOT NULL,
	"turn_id" text NOT NULL,
	"tool_call_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"effect" text NOT NULL,
	"step_number" integer,
	"status" text DEFAULT 'running' NOT NULL,
	"duration_ms" integer,
	"error_code" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ai_agent_tool_execution_effect_check" CHECK ("effect" in ('read', 'write', 'analysis', 'artifact')),
	CONSTRAINT "ai_agent_tool_execution_status_check" CHECK ("status" in ('running', 'succeeded', 'failed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "ai_agent_turn" ADD CONSTRAINT "ai_agent_turn_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_agent_turn" ADD CONSTRAINT "ai_agent_turn_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_agent_turn" ADD CONSTRAINT "ai_agent_turn_thread_id_ai_chat_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."ai_chat_thread"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_agent_tool_execution" ADD CONSTRAINT "ai_agent_tool_execution_turn_id_ai_agent_turn_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."ai_agent_turn"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ai_agent_turn_workspace_created_idx" ON "ai_agent_turn" USING btree ("workspace_id","created_at");
--> statement-breakpoint
CREATE INDEX "ai_agent_turn_user_created_idx" ON "ai_agent_turn" USING btree ("workspace_id","user_id","created_at");
--> statement-breakpoint
CREATE INDEX "ai_agent_turn_running_idx" ON "ai_agent_turn" USING btree ("workspace_id","status","started_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_tool_execution_turn_call_unique" ON "ai_agent_tool_execution" USING btree ("turn_id","tool_call_id");
--> statement-breakpoint
CREATE INDEX "ai_agent_tool_execution_turn_created_idx" ON "ai_agent_tool_execution" USING btree ("turn_id","created_at");
