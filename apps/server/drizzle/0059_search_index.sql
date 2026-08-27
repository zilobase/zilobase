CREATE TABLE "search_document" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "source_page_id" text,
  "title" text NOT NULL,
  "path" text NOT NULL,
  "emoji" text,
  "content_text" text DEFAULT '' NOT NULL,
  "search_vector" tsvector NOT NULL,
  "source_updated_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);--> statement-breakpoint
ALTER TABLE "search_document" ADD CONSTRAINT "search_document_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "search_document_source_unique" ON "search_document" USING btree ("workspace_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "search_document_workspace_type_updated_idx" ON "search_document" USING btree ("workspace_id","source_type","source_updated_at");--> statement-breakpoint
CREATE INDEX "search_document_search_vector_idx" ON "search_document" USING gin ("search_vector");--> statement-breakpoint

CREATE TABLE "search_chunk" (
  "id" text PRIMARY KEY NOT NULL,
  "document_id" text NOT NULL,
  "workspace_id" text NOT NULL,
  "chunk_index" integer NOT NULL,
  "content" text NOT NULL,
  "token_estimate" integer DEFAULT 0 NOT NULL,
  "search_vector" tsvector NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);--> statement-breakpoint
ALTER TABLE "search_chunk" ADD CONSTRAINT "search_chunk_document_id_search_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."search_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_chunk" ADD CONSTRAINT "search_chunk_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "search_chunk_document_index_unique" ON "search_chunk" USING btree ("document_id","chunk_index");--> statement-breakpoint
CREATE INDEX "search_chunk_workspace_document_idx" ON "search_chunk" USING btree ("workspace_id","document_id");--> statement-breakpoint
CREATE INDEX "search_chunk_search_vector_idx" ON "search_chunk" USING gin ("search_vector");--> statement-breakpoint

CREATE OR REPLACE FUNCTION zilobase_index_page() RETURNS trigger AS $$
DECLARE
  body text;
  document_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    document_id := 'page:' || OLD.id;
    DELETE FROM search_document WHERE id = document_id;
    RETURN OLD;
  END IF;
  document_id := 'page:' || NEW.id;
  IF NEW.deleted_at IS NOT NULL THEN
    DELETE FROM search_document WHERE id = document_id;
    RETURN NEW;
  END IF;
  SELECT COALESCE(string_agg(trim(both '"' from value::text), ' '), '') INTO body
    FROM jsonb_path_query(COALESCE(NEW.content, '{}'::jsonb), '$.**.text') AS value;
  INSERT INTO search_document (
    id, workspace_id, source_type, source_id, source_page_id, title, path,
    emoji, content_text, search_vector, source_updated_at, created_at, updated_at
  ) VALUES (
    document_id, NEW.workspace_id, 'page', NEW.id, NEW.id,
    COALESCE(NULLIF(BTRIM(NEW.name), ''), 'Untitled'),
    COALESCE(NULLIF(BTRIM(NEW.name), ''), 'Untitled'),
    NEW.metadata->>'emoji', body,
    setweight(to_tsvector('simple', COALESCE(NEW.name, '')), 'A') ||
      setweight(to_tsvector('simple', body), 'B'),
    NEW.updated_at, NOW(), NOW()
  ) ON CONFLICT (id) DO UPDATE SET
    workspace_id = EXCLUDED.workspace_id, title = EXCLUDED.title,
    path = EXCLUDED.path, emoji = EXCLUDED.emoji, content_text = EXCLUDED.content_text,
    search_vector = EXCLUDED.search_vector,
    source_updated_at = EXCLUDED.source_updated_at, updated_at = NOW();
  INSERT INTO search_chunk (
    id, document_id, workspace_id, chunk_index, content, token_estimate,
    search_vector, metadata, created_at, updated_at
  ) VALUES (
    document_id || ':0', document_id, NEW.workspace_id, 0, LEFT(body, 24000),
    CEIL(CHAR_LENGTH(LEFT(body, 24000)) / 4.0)::integer,
    to_tsvector('simple', LEFT(body, 24000)), '{}'::jsonb, NOW(), NOW()
  ) ON CONFLICT (id) DO UPDATE SET
    content = EXCLUDED.content, token_estimate = EXCLUDED.token_estimate,
    search_vector = EXCLUDED.search_vector, updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER page_search_index_trigger AFTER INSERT OR UPDATE OF name, content, metadata, deleted_at ON page FOR EACH ROW EXECUTE FUNCTION zilobase_index_page();--> statement-breakpoint
CREATE TRIGGER page_search_index_delete_trigger AFTER DELETE ON page FOR EACH ROW EXECUTE FUNCTION zilobase_index_page();--> statement-breakpoint

CREATE OR REPLACE FUNCTION zilobase_index_database() RETURNS trigger AS $$
DECLARE
  document_id text;
  parent_name text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    document_id := 'database:' || OLD.id;
    DELETE FROM search_document WHERE id = document_id;
    RETURN OLD;
  END IF;
  document_id := 'database:' || NEW.id;
  IF NEW.deleted_at IS NOT NULL THEN
    DELETE FROM search_document WHERE id = document_id;
    RETURN NEW;
  END IF;
  SELECT name INTO parent_name FROM page WHERE id = NEW.page_id AND deleted_at IS NULL;
  INSERT INTO search_document (
    id, workspace_id, source_type, source_id, source_page_id, title, path,
    emoji, content_text, search_vector, source_updated_at, created_at, updated_at
  ) VALUES (
    document_id, NEW.workspace_id, 'database', NEW.id, NEW.page_id,
    COALESCE(NULLIF(BTRIM(NEW.name), ''), 'Database'),
    CASE WHEN parent_name IS NULL THEN COALESCE(NULLIF(BTRIM(NEW.name), ''), 'Database')
      ELSE parent_name || ' / ' || COALESCE(NULLIF(BTRIM(NEW.name), ''), 'Database') END,
    NEW.config->>'emoji', '', to_tsvector('simple', COALESCE(NEW.name, '')),
    NEW.updated_at, NOW(), NOW()
  ) ON CONFLICT (id) DO UPDATE SET
    workspace_id = EXCLUDED.workspace_id, source_page_id = EXCLUDED.source_page_id,
    title = EXCLUDED.title, path = EXCLUDED.path, emoji = EXCLUDED.emoji,
    search_vector = EXCLUDED.search_vector,
    source_updated_at = EXCLUDED.source_updated_at, updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER database_search_index_trigger AFTER INSERT OR UPDATE OF name, config, page_id, deleted_at ON database FOR EACH ROW EXECUTE FUNCTION zilobase_index_database();--> statement-breakpoint
CREATE TRIGGER database_search_index_delete_trigger AFTER DELETE ON database FOR EACH ROW EXECUTE FUNCTION zilobase_index_database();--> statement-breakpoint

INSERT INTO search_document (id, workspace_id, source_type, source_id, source_page_id, title, path, emoji, content_text, search_vector, source_updated_at, created_at, updated_at)
SELECT 'page:' || id, workspace_id, 'page', id, id,
  COALESCE(NULLIF(BTRIM(name), ''), 'Untitled'), COALESCE(NULLIF(BTRIM(name), ''), 'Untitled'),
  metadata->>'emoji', '', to_tsvector('simple', COALESCE(name, '')), updated_at, NOW(), NOW()
FROM page WHERE deleted_at IS NULL ON CONFLICT (id) DO NOTHING;--> statement-breakpoint
UPDATE page SET content = content WHERE deleted_at IS NULL;--> statement-breakpoint
INSERT INTO search_document (id, workspace_id, source_type, source_id, source_page_id, title, path, emoji, content_text, search_vector, source_updated_at, created_at, updated_at)
SELECT 'database:' || d.id, d.workspace_id, 'database', d.id, d.page_id,
  COALESCE(NULLIF(BTRIM(d.name), ''), 'Database'),
  CASE WHEN p.name IS NULL THEN COALESCE(NULLIF(BTRIM(d.name), ''), 'Database') ELSE p.name || ' / ' || COALESCE(NULLIF(BTRIM(d.name), ''), 'Database') END,
  d.config->>'emoji', '', to_tsvector('simple', COALESCE(d.name, '')), d.updated_at, NOW(), NOW()
FROM database d LEFT JOIN page p ON p.id = d.page_id AND p.deleted_at IS NULL
WHERE d.deleted_at IS NULL ON CONFLICT (id) DO NOTHING;
