CREATE TABLE "organization_ai_provider_config" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"api_key" text,
	"base_url" text,
	"model_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_integration" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"connected_by_id" text,
	"integration_key" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"display_name" text,
	"status" text DEFAULT 'connected' NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_type" text,
	"scopes" text,
	"expires_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_ai_provider_config" ADD CONSTRAINT "organization_ai_provider_config_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_integration" ADD CONSTRAINT "organization_integration_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_integration" ADD CONSTRAINT "organization_integration_connected_by_id_user_id_fk" FOREIGN KEY ("connected_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_ai_provider_config_provider_idx" ON "organization_ai_provider_config" USING btree ("organization_id","provider_id");--> statement-breakpoint
CREATE INDEX "organization_ai_provider_config_org_idx" ON "organization_ai_provider_config" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_integration_account_idx" ON "organization_integration" USING btree ("organization_id","integration_key","provider_account_id");--> statement-breakpoint
CREATE INDEX "organization_integration_org_idx" ON "organization_integration" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_integration_key_idx" ON "organization_integration" USING btree ("organization_id","integration_key");--> statement-breakpoint
CREATE INDEX "organization_integration_status_idx" ON "organization_integration" USING btree ("status");