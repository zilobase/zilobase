ALTER TABLE "page_settings" ADD COLUMN IF NOT EXISTS "sidebar_config" jsonb DEFAULT '{}'::jsonb NOT NULL;
