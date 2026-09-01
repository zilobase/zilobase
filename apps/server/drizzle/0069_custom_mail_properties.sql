CREATE TABLE "mail_property" (
	"id" text PRIMARY KEY NOT NULL,
	"binding_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mail_property_type_check" CHECK ("mail_property"."type" in ('text', 'number', 'select', 'multi_select', 'status', 'date', 'person', 'checkbox', 'url', 'files'))
);
--> statement-breakpoint
CREATE TABLE "mail_thread_property_value" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"gmail_thread_id" text NOT NULL,
	"value" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_property" ADD CONSTRAINT "mail_property_binding_id_gmail_workspace_connection_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."gmail_workspace_connection"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mail_thread_property_value" ADD CONSTRAINT "mail_thread_property_value_property_id_mail_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."mail_property"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "mail_property_binding_created_idx" ON "mail_property" USING btree ("binding_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "mail_thread_property_value_property_thread_unique" ON "mail_thread_property_value" USING btree ("property_id", "gmail_thread_id");
--> statement-breakpoint
CREATE INDEX "mail_thread_property_value_thread_idx" ON "mail_thread_property_value" USING btree ("gmail_thread_id");
