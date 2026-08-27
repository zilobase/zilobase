ALTER TABLE "ai_chat_thread" ADD COLUMN "pinned_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE "ai_agent_user_preference" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"response_style" text DEFAULT 'concise' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ai_agent_user_preference_response_style_check" CHECK ("response_style" in ('concise', 'balanced', 'detailed'))
);
--> statement-breakpoint
CREATE TABLE "ai_chat_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"message_id" text NOT NULL,
	"rating" integer NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ai_chat_feedback_rating_check" CHECK ("rating" in (-1, 1))
);
--> statement-breakpoint
ALTER TABLE "ai_agent_user_preference" ADD CONSTRAINT "ai_agent_user_preference_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_agent_user_preference" ADD CONSTRAINT "ai_agent_user_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_chat_feedback" ADD CONSTRAINT "ai_chat_feedback_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_chat_feedback" ADD CONSTRAINT "ai_chat_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_chat_feedback" ADD CONSTRAINT "ai_chat_feedback_thread_id_ai_chat_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."ai_chat_thread"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_chat_feedback" ADD CONSTRAINT "ai_chat_feedback_message_id_ai_chat_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."ai_chat_message"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_user_preference_workspace_user_unique" ON "ai_agent_user_preference" USING btree ("workspace_id","user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_chat_feedback_user_message_unique" ON "ai_chat_feedback" USING btree ("user_id","message_id");
--> statement-breakpoint
CREATE INDEX "ai_chat_feedback_workspace_created_idx" ON "ai_chat_feedback" USING btree ("workspace_id","created_at");
