ALTER TABLE "meeting" ADD COLUMN "notes_page_id" text;
--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_notes_page_id_page_id_fk" FOREIGN KEY ("notes_page_id") REFERENCES "public"."page"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_notes_page_id_unique" ON "meeting" USING btree ("notes_page_id");
