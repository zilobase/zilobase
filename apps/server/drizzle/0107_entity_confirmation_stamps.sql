-- Confirmations compare these existing stamps across independently versioned hosts.
-- A BEFORE trigger sees the row after its lock is acquired, including writers
-- outside the HTTP command path (Yjs, automation, import and lifecycle updates).
CREATE FUNCTION zilobase_stamp_entity_update() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := GREATEST(
    date_trunc('milliseconds', clock_timestamp()),
    date_trunc('milliseconds', OLD.updated_at) + interval '1 millisecond'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER page_confirmation_stamp BEFORE UPDATE ON page
FOR EACH ROW EXECUTE FUNCTION zilobase_stamp_entity_update();
--> statement-breakpoint
CREATE TRIGGER property_confirmation_stamp BEFORE UPDATE ON page_property
FOR EACH ROW EXECUTE FUNCTION zilobase_stamp_entity_update();
--> statement-breakpoint
CREATE TRIGGER value_confirmation_stamp BEFORE UPDATE ON page_property_value
FOR EACH ROW EXECUTE FUNCTION zilobase_stamp_entity_update();
--> statement-breakpoint
CREATE TRIGGER record_confirmation_stamp BEFORE UPDATE ON database_row
FOR EACH ROW EXECUTE FUNCTION zilobase_stamp_entity_update();
--> statement-breakpoint
CREATE TRIGGER binding_confirmation_stamp BEFORE UPDATE ON database_property
FOR EACH ROW EXECUTE FUNCTION zilobase_stamp_entity_update();
