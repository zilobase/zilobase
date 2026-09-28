ALTER TABLE "database_command_receipt" ALTER COLUMN "event_id" DROP NOT NULL;
--> statement-breakpoint
CREATE TABLE "database_actor_state" (
  "id" text PRIMARY KEY NOT NULL,
  "database_id" text NOT NULL REFERENCES "database"("id") ON DELETE CASCADE,
  "actor_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "revision" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "database_actor_state_owner_unique" ON "database_actor_state" ("database_id", "actor_id");
