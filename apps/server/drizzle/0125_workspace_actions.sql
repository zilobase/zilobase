CREATE TABLE "workspace_action_receipt" (
	"invocation_id" text NOT NULL,
	"call_id" text NOT NULL,
	"op_index" integer NOT NULL,
	"kind" text NOT NULL,
	"request" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "workspace_action_receipt_pk" PRIMARY KEY("invocation_id","call_id","op_index")
);
--> statement-breakpoint
CREATE INDEX "workspace_action_receipt_created_idx" ON "workspace_action_receipt" USING btree ("created_at");
--> statement-breakpoint
CREATE TABLE "workspace_action_change" (
	"id" text PRIMARY KEY NOT NULL,
	"invocation_id" text NOT NULL,
	"call_id" text NOT NULL,
	"op_index" integer NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"command_type" text NOT NULL,
	"database_id" text,
	"data_source_id" text,
	"summary" jsonb NOT NULL,
	"inverse" jsonb,
	"undone_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_action_change" ADD CONSTRAINT "workspace_action_change_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workspace_action_change" ADD CONSTRAINT "workspace_action_change_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "workspace_action_change_invocation_idx" ON "workspace_action_change" USING btree ("invocation_id","op_index");
--> statement-breakpoint
CREATE INDEX "workspace_action_change_owner_idx" ON "workspace_action_change" USING btree ("workspace_id","user_id","created_at");
