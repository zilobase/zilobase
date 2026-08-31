CREATE TABLE "navigation_realtime_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"committed_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "navigation_realtime_outbox" ADD CONSTRAINT "navigation_realtime_outbox_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "navigation_realtime_outbox_ready_idx" ON "navigation_realtime_outbox" USING btree ("next_attempt_at", "committed_at");
--> statement-breakpoint
CREATE INDEX "navigation_realtime_outbox_workspace_idx" ON "navigation_realtime_outbox" USING btree ("workspace_id", "committed_at");
