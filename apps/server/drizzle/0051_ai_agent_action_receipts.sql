CREATE TABLE "ai_agent_action_receipt" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"tool_call_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"input_hash" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"result" jsonb,
	"error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_agent_action_receipt" ADD CONSTRAINT "ai_agent_action_receipt_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_agent_action_receipt" ADD CONSTRAINT "ai_agent_action_receipt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_agent_action_receipt" ADD CONSTRAINT "ai_agent_action_receipt_thread_id_ai_chat_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."ai_chat_thread"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_action_receipt_thread_tool_call_unique" ON "ai_agent_action_receipt" USING btree ("thread_id","tool_call_id");
--> statement-breakpoint
CREATE INDEX "ai_agent_action_receipt_workspace_user_created_idx" ON "ai_agent_action_receipt" USING btree ("workspace_id","user_id","created_at");
