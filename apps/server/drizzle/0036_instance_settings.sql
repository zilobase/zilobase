CREATE TABLE "instance_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"instance_id" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_settings_instance_id_unique" UNIQUE("instance_id")
);
