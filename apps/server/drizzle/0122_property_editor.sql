-- Editorial and verification clocks are not document-body confirmations.
CREATE OR REPLACE FUNCTION zilobase_stamp_entity_update() RETURNS trigger AS $$
BEGIN
 IF TG_TABLE_NAME='page' AND
  (to_jsonb(NEW)-ARRAY['last_edited_at','last_edited_by_id','verified_at','verified_by_id','verification_expires_at','verification_updated_at']) IS NOT DISTINCT FROM
  (to_jsonb(OLD)-ARRAY['last_edited_at','last_edited_by_id','verified_at','verified_by_id','verification_expires_at','verification_updated_at']) THEN
  NEW.updated_at=OLD.updated_at; RETURN NEW;
 END IF;
 NEW.updated_at=GREATEST(date_trunc('milliseconds',clock_timestamp()),date_trunc('milliseconds',OLD.updated_at)+interval '1 millisecond');
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE FUNCTION zilobase_definition_content_editor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.name,NEW.type,NEW.config,NEW.deleted_at) IS NOT DISTINCT FROM ROW(OLD.name,OLD.type,OLD.config,OLD.deleted_at) THEN RETURN NEW; END IF;
 UPDATE database d SET last_edited_at=clock_timestamp(),last_edited_by_id=nullif(current_setting('zilobase.content_actor',true),'')
 WHERE d.deleted_at IS NULL AND d.id IN (SELECT ds.parent_database_id FROM database_property dp JOIN data_source ds ON ds.id=dp.data_source_id WHERE dp.property_id=NEW.id AND ds.workspace_id=NEW.workspace_id AND ds.deleted_at IS NULL);
 RETURN NEW;
END $$;
CREATE TRIGGER definition_content_editor AFTER UPDATE ON page_property FOR EACH ROW EXECUTE FUNCTION zilobase_definition_content_editor();
