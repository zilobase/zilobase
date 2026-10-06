CREATE TABLE background_dispatch (
  id text PRIMARY KEY,
  cell_id text NOT NULL,
  logical_key text NOT NULL,
  kind text NOT NULL,
  resource_id text NOT NULL,
  task jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  available_at timestamptz NOT NULL,
  next_publication_at timestamptz NOT NULL,
  published_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  error_code text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT background_dispatch_status_check CHECK (status IN ('pending','published','running','completed','terminal','exhausted','cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX background_dispatch_logical_unique ON background_dispatch(cell_id, logical_key);
--> statement-breakpoint
CREATE INDEX background_dispatch_publication_idx ON background_dispatch(cell_id, status, next_publication_at);
