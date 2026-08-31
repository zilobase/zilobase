DROP INDEX "gmail_connection_google_subject_unique";--> statement-breakpoint
CREATE INDEX "gmail_connection_google_subject_idx" ON "gmail_connection" USING btree ("google_subject");
