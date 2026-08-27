ALTER TABLE "workspace_ai_provider_config" ADD COLUMN "credential_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_ai_provider_config" ADD COLUMN "credential_iv" text;--> statement-breakpoint
ALTER TABLE "workspace_ai_provider_config" ADD COLUMN "credential_key_version" text;--> statement-breakpoint
ALTER TABLE "workspace_ai_provider_config" ADD COLUMN "credential_fingerprint" text;
