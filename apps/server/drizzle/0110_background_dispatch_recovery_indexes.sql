CREATE INDEX background_dispatch_failure_pending_idx ON background_dispatch(cell_id, completed_at) WHERE status = 'exhausted' AND failure_handled_at IS NULL;
--> statement-breakpoint
CREATE INDEX background_dispatch_expired_owner_idx ON background_dispatch(cell_id, lease_expires_at) WHERE status = 'running';
