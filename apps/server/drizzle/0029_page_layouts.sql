CREATE TABLE "page_layout" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_layout_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "page_layout_workspace_idx" ON "page_layout" USING btree ("workspace_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "page_layout_scope_unique" ON "page_layout" USING btree ("scope_type", "scope_id");
