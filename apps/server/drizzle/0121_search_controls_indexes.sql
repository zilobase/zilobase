CREATE INDEX page_search_created_idx ON page(workspace_id,created_at,id) WHERE deleted_at IS NULL;
CREATE INDEX page_search_edited_idx ON page(workspace_id,last_edited_at,id) WHERE deleted_at IS NULL;
CREATE INDEX page_search_creator_idx ON page(workspace_id,created_by_id,id) WHERE deleted_at IS NULL;
CREATE INDEX page_search_editor_idx ON page(workspace_id,last_edited_by_id,id) WHERE deleted_at IS NULL;
CREATE INDEX page_search_title_idx ON page USING gin(to_tsvector('simple',name)) WHERE deleted_at IS NULL;
CREATE INDEX database_search_created_idx ON database(workspace_id,created_at,id) WHERE deleted_at IS NULL;
CREATE INDEX database_search_edited_idx ON database(workspace_id,last_edited_at,id) WHERE deleted_at IS NULL;
CREATE INDEX database_search_creator_idx ON database(workspace_id,created_by_id,id) WHERE deleted_at IS NULL;
CREATE INDEX database_search_editor_idx ON database(workspace_id,last_edited_by_id,id) WHERE deleted_at IS NULL;
