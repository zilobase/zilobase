ALTER TABLE "database" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE "database_realtime_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"database_id" text NOT NULL,
	"version" integer NOT NULL,
	"actor_id" text NOT NULL,
	"changed" text[] NOT NULL,
	"delta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requires_refetch" boolean DEFAULT false NOT NULL,
	"committed_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "database_realtime_outbox" ADD CONSTRAINT "database_realtime_outbox_database_id_database_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."database"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "database_realtime_outbox_database_id_idx" ON "database_realtime_outbox" USING btree ("database_id");
--> statement-breakpoint
CREATE INDEX "database_realtime_outbox_ready_idx" ON "database_realtime_outbox" USING btree ("next_attempt_at","committed_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "database_realtime_outbox_database_version_unique" ON "database_realtime_outbox" USING btree ("database_id","version");
