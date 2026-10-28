ALTER TABLE ask_ai_thread ADD COLUMN compacted_memory text;
ALTER TABLE ask_ai_run ALTER COLUMN deadline_at DROP NOT NULL;
UPDATE ask_ai_run SET deadline_at = NULL WHERE agent_version = 2 AND status IN ('queued', 'running');
