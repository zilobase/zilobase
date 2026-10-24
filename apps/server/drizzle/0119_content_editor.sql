ALTER TABLE page ADD COLUMN last_edited_at timestamptz, ADD COLUMN last_edited_by_id text REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE database ADD COLUMN last_edited_at timestamptz, ADD COLUMN last_edited_by_id text REFERENCES "user"(id) ON DELETE SET NULL;
UPDATE page SET last_edited_at=updated_at;
UPDATE database SET last_edited_at=updated_at;
ALTER TABLE page ALTER COLUMN last_edited_at SET DEFAULT now(), ALTER COLUMN last_edited_at SET NOT NULL;
ALTER TABLE database ALTER COLUMN last_edited_at SET DEFAULT now(), ALTER COLUMN last_edited_at SET NOT NULL;
--> statement-breakpoint
CREATE FUNCTION zilobase_content_editor() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor text := nullif(current_setting('zilobase.content_actor',true),'');
BEGIN
 IF TG_OP='INSERT' THEN NEW.last_edited_by_id=NEW.created_by_id; NEW.last_edited_at=NEW.created_at; RETURN NEW; END IF;
 IF TG_TABLE_NAME='page' THEN
  IF ROW(NEW.name,NEW.content) IS NOT DISTINCT FROM ROW(OLD.name,OLD.content) THEN RETURN NEW; END IF;
 ELSE
  IF ROW(NEW.name,NEW.config) IS NOT DISTINCT FROM ROW(OLD.name,OLD.config) THEN RETURN NEW; END IF;
 END IF;
 IF nullif(current_setting('zilobase.content_edit_at',true),'') IS NOT NULL THEN
  IF current_setting('zilobase.content_edit_at')::timestamptz >= OLD.last_edited_at THEN
   NEW.last_edited_at=current_setting('zilobase.content_edit_at')::timestamptz; NEW.last_edited_by_id=actor;
  ELSE NEW.last_edited_at=OLD.last_edited_at; NEW.last_edited_by_id=OLD.last_edited_by_id; END IF;
  RETURN NEW;
 END IF;
 -- Explicit attribution wins.
 IF NEW.last_edited_at IS NOT DISTINCT FROM OLD.last_edited_at THEN
  NEW.last_edited_at=clock_timestamp(); NEW.last_edited_by_id=actor;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER page_content_editor BEFORE INSERT OR UPDATE ON page FOR EACH ROW EXECUTE FUNCTION zilobase_content_editor();
CREATE TRIGGER database_content_editor BEFORE INSERT OR UPDATE ON database FOR EACH ROW EXECUTE FUNCTION zilobase_content_editor();
--> statement-breakpoint
CREATE FUNCTION zilobase_property_content_editor() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor text := nullif(current_setting('zilobase.content_actor',true),''); p text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.value IS NOT DISTINCT FROM OLD.value THEN RETURN NEW; END IF;
 p=CASE WHEN TG_OP='DELETE' THEN OLD.page_id ELSE NEW.page_id END;
 UPDATE page SET last_edited_at=clock_timestamp(),last_edited_by_id=actor WHERE id=p;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER property_content_editor AFTER INSERT OR UPDATE OR DELETE ON page_property_value FOR EACH ROW EXECUTE FUNCTION zilobase_property_content_editor();
CREATE FUNCTION zilobase_database_content_editor() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor text := nullif(current_setting('zilobase.content_actor',true),''); source text; host text;
BEGIN
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['updated_at','version','search_revision','config_version']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','version','search_revision','config_version']) THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='database_view' THEN host=CASE WHEN TG_OP='DELETE' THEN OLD.database_id ELSE NEW.database_id END;
 ELSIF TG_TABLE_NAME='data_source' THEN host=CASE WHEN TG_OP='DELETE' THEN OLD.parent_database_id ELSE NEW.parent_database_id END;
 ELSE
  source=CASE WHEN TG_OP='DELETE' THEN OLD.data_source_id ELSE NEW.data_source_id END;
  SELECT parent_database_id INTO host FROM data_source WHERE id=source;
 END IF;
 UPDATE database SET last_edited_at=clock_timestamp(),last_edited_by_id=actor WHERE id=host;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER source_content_editor AFTER UPDATE ON data_source FOR EACH ROW EXECUTE FUNCTION zilobase_database_content_editor();
CREATE TRIGGER view_content_editor AFTER INSERT OR UPDATE OR DELETE ON database_view FOR EACH ROW EXECUTE FUNCTION zilobase_database_content_editor();
CREATE TRIGGER database_property_content_editor AFTER INSERT OR UPDATE OR DELETE ON database_property FOR EACH ROW EXECUTE FUNCTION zilobase_database_content_editor();
