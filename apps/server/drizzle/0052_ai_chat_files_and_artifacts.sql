CREATE TABLE "ai_chat_upload" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"object_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"extracted_text" text,
	"extraction" jsonb,
	"uploaded_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_chat_artifact" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"object_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_chat_upload" ADD CONSTRAINT "ai_chat_upload_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_chat_upload" ADD CONSTRAINT "ai_chat_upload_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_chat_upload" ADD CONSTRAINT "ai_chat_upload_thread_id_ai_chat_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."ai_chat_thread"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_chat_artifact" ADD CONSTRAINT "ai_chat_artifact_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_chat_artifact" ADD CONSTRAINT "ai_chat_artifact_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_chat_artifact" ADD CONSTRAINT "ai_chat_artifact_thread_id_ai_chat_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."ai_chat_thread"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_chat_upload_object_key_unique" ON "ai_chat_upload" USING btree ("object_key");
--> statement-breakpoint
CREATE INDEX "ai_chat_upload_owner_thread_idx" ON "ai_chat_upload" USING btree ("workspace_id","user_id","thread_id","created_at");
--> statement-breakpoint
CREATE INDEX "ai_chat_upload_expiry_idx" ON "ai_chat_upload" USING btree ("status","expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_chat_artifact_object_key_unique" ON "ai_chat_artifact" USING btree ("object_key");
--> statement-breakpoint
CREATE INDEX "ai_chat_artifact_owner_thread_idx" ON "ai_chat_artifact" USING btree ("workspace_id","user_id","thread_id","created_at");
--> statement-breakpoint
CREATE INDEX "ai_chat_artifact_expiry_idx" ON "ai_chat_artifact" USING btree ("status","expires_at");
