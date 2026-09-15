ALTER TABLE "database_row" ADD COLUMN "order_key" numeric(30, 10);
--> statement-breakpoint
UPDATE "database_row"
SET "order_key" = ("position"::numeric + 1) * 1024
WHERE "order_key" IS NULL;
--> statement-breakpoint
CREATE INDEX "database_row_source_order_idx"
ON "database_row" USING btree ("data_source_id", "order_key", "id")
WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE TABLE "database_mutation_event" (
	"id" text PRIMARY KEY NOT NULL,
	"command_id" text NOT NULL,
	"database_id" text NOT NULL,
	"data_source_id" text,
	"actor_id" text NOT NULL,
	"protocol_version" integer DEFAULT 2 NOT NULL,
	"version" integer NOT NULL,
	"areas" text[] NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requires_reset" boolean DEFAULT false NOT NULL,
	"committed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "database_mutation_event_database_id_database_id_fk"
		FOREIGN KEY ("database_id") REFERENCES "public"."database"("id")
		ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "database_mutation_event_data_source_id_data_source_id_fk"
		FOREIGN KEY ("data_source_id") REFERENCES "public"."data_source"("id")
		ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "database_mutation_event_database_version_unique"
ON "database_mutation_event" USING btree ("database_id", "version");
--> statement-breakpoint
CREATE INDEX "database_mutation_event_database_committed_idx"
ON "database_mutation_event" USING btree ("database_id", "committed_at");
--> statement-breakpoint
CREATE INDEX "database_mutation_event_command_idx"
ON "database_mutation_event" USING btree ("command_id");
--> statement-breakpoint
CREATE INDEX "database_mutation_event_retention_idx"
ON "database_mutation_event" USING btree ("committed_at");
--> statement-breakpoint
CREATE TABLE "database_command_receipt" (
	"command_id" text PRIMARY KEY NOT NULL,
	"database_id" text NOT NULL,
	"data_source_id" text,
	"actor_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"event_id" text NOT NULL,
	"acknowledgement" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "database_command_receipt_database_id_database_id_fk"
		FOREIGN KEY ("database_id") REFERENCES "public"."database"("id")
		ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "database_command_receipt_data_source_id_data_source_id_fk"
		FOREIGN KEY ("data_source_id") REFERENCES "public"."data_source"("id")
		ON DELETE set null ON UPDATE no action,
	CONSTRAINT "database_command_receipt_event_id_database_mutation_event_id_fk"
		FOREIGN KEY ("event_id") REFERENCES "public"."database_mutation_event"("id")
		ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "database_command_receipt_database_created_idx"
ON "database_command_receipt" USING btree ("database_id", "created_at");
--> statement-breakpoint
CREATE INDEX "database_command_receipt_retention_idx"
ON "database_command_receipt" USING btree ("expires_at");
