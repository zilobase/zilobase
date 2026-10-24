ALTER TABLE page ADD COLUMN verified_at timestamptz, ADD COLUMN verified_by_id text REFERENCES "user"(id) ON DELETE SET NULL, ADD COLUMN verification_expires_at timestamptz, ADD COLUMN verification_updated_at timestamptz,
ADD CONSTRAINT page_verification_expiry CHECK (verification_expires_at IS NULL OR verified_at IS NOT NULL AND verification_expires_at > verified_at);
ALTER TABLE database ADD COLUMN verified_at timestamptz, ADD COLUMN verified_by_id text REFERENCES "user"(id) ON DELETE SET NULL, ADD COLUMN verification_expires_at timestamptz, ADD COLUMN verification_updated_at timestamptz,
ADD CONSTRAINT database_verification_expiry CHECK (verification_expires_at IS NULL OR verified_at IS NOT NULL AND verification_expires_at > verified_at);
