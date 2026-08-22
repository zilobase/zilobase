ALTER TABLE "member" ADD COLUMN "access_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "membership_expires_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX "member_access_expires_at_idx" ON "member" USING btree ("access_expires_at");
--> statement-breakpoint
CREATE INDEX "invitation_membership_expires_at_idx" ON "invitation" USING btree ("membership_expires_at");
--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_temporary_expiry_check" CHECK (("role" = 'temporary' and "access_expires_at" is not null) or ("role" <> 'temporary' and "access_expires_at" is null));
--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_temporary_expiry_check" CHECK (("role" = 'temporary' and "membership_expires_at" is not null) or ("role" <> 'temporary' and "membership_expires_at" is null));
