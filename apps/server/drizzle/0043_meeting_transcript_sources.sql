UPDATE "meeting_transcript_segment"
SET "source" = 'microphone'
WHERE "source" NOT IN ('microphone', 'system');
--> statement-breakpoint
ALTER TABLE "meeting_transcript_segment" ALTER COLUMN "source" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "meeting_transcript_segment" ADD CONSTRAINT "meeting_transcript_source_check" CHECK ("meeting_transcript_segment"."source" in ('microphone', 'system'));
