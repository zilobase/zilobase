ALTER TABLE "page" ADD COLUMN "has_content" boolean;
--> statement-breakpoint
CREATE FUNCTION "zilobase_page_body_has_content"(node jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  child jsonb;
  node_type text;
  serialized text;
BEGIN
  IF node IS NULL OR node = 'null'::jsonb THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(node) = 'string' THEN
    serialized := node #>> '{}';

    IF btrim(serialized) = '' THEN
      RETURN false;
    END IF;

    BEGIN
      RETURN "zilobase_page_body_has_content"(serialized::jsonb);
    EXCEPTION WHEN others THEN
      RETURN true;
    END;
  END IF;

  IF jsonb_typeof(node) = 'array' THEN
    FOR child IN SELECT value FROM jsonb_array_elements(node)
    LOOP
      IF "zilobase_page_body_has_content"(child) THEN
        RETURN true;
      END IF;
    END LOOP;

    RETURN false;
  END IF;

  IF jsonb_typeof(node) <> 'object' THEN
    RETURN true;
  END IF;

  node_type := node ->> 'type';

  IF node_type = 'text' THEN
    RETURN btrim(COALESCE(node ->> 'text', '')) <> '';
  END IF;

  IF node_type IS NULL OR node_type IN ('doc', 'paragraph', 'heading', 'hardBreak') THEN
    RETURN "zilobase_page_body_has_content"(node -> 'content');
  END IF;

  RETURN true;
END;
$$;
--> statement-breakpoint
UPDATE "page"
SET "has_content" = "zilobase_page_body_has_content"("content");
--> statement-breakpoint
DROP FUNCTION "zilobase_page_body_has_content"(jsonb);
--> statement-breakpoint
ALTER TABLE "page" ALTER COLUMN "has_content" SET DEFAULT false;
--> statement-breakpoint
ALTER TABLE "page" ALTER COLUMN "has_content" SET NOT NULL;
