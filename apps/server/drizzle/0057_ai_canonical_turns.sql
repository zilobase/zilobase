ALTER TABLE "ai_chat_thread" ADD COLUMN "next_message_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_chat_message" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "ai_chat_message" ADD COLUMN "sequence" integer;--> statement-breakpoint
ALTER TABLE "ai_chat_message" ADD COLUMN "status" text DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_chat_message" ADD COLUMN "turn_id" text;--> statement-breakpoint
WITH ordered AS (
  SELECT "id", row_number() OVER (PARTITION BY "thread_id" ORDER BY "created_at", "id") - 1 AS "sequence"
  FROM "ai_chat_message"
)
UPDATE "ai_chat_message"
SET "sequence" = ordered."sequence"
FROM ordered
WHERE "ai_chat_message"."id" = ordered."id";--> statement-breakpoint
UPDATE "ai_chat_thread" AS thread
SET "next_message_sequence" = counts."next_sequence"
FROM (
  SELECT "thread_id", coalesce(max("sequence") + 1, 0) AS "next_sequence"
  FROM "ai_chat_message"
  GROUP BY "thread_id"
) AS counts
WHERE thread."id" = counts."thread_id";--> statement-breakpoint
ALTER TABLE "ai_chat_message" ALTER COLUMN "sequence" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_chat_message" ALTER COLUMN "sequence" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "ai_agent_turn" ADD COLUMN "client_turn_id" text;--> statement-breakpoint
ALTER TABLE "ai_agent_turn" ADD COLUMN "user_message_id" text;--> statement-breakpoint
ALTER TABLE "ai_agent_turn" ADD CONSTRAINT "ai_agent_turn_user_message_id_ai_chat_message_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."ai_chat_message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_chat_message_thread_client_unique" ON "ai_chat_message" USING btree ("thread_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_chat_message_thread_sequence_unique" ON "ai_chat_message" USING btree ("thread_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_turn_thread_client_unique" ON "ai_agent_turn" USING btree ("thread_id","client_turn_id");--> statement-breakpoint
ALTER TABLE "ai_chat_message" ADD CONSTRAINT "ai_chat_message_status_check" CHECK ("status" in ('completed', 'failed', 'cancelled'));--> statement-breakpoint
CREATE TABLE "ai_chat_thread_summary" (
  "id" text PRIMARY KEY NOT NULL,
  "thread_id" text NOT NULL,
  "covered_through_sequence" integer NOT NULL,
  "summary" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);--> statement-breakpoint
ALTER TABLE "ai_chat_thread_summary" ADD CONSTRAINT "ai_chat_thread_summary_thread_id_ai_chat_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."ai_chat_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_chat_thread_summary_thread_unique" ON "ai_chat_thread_summary" USING btree ("thread_id");
