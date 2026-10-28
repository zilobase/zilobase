-- Repair databases that applied editorial migrations before the body-clock guard
-- was added. Use a new migration because applied migrations are not rerun.
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
