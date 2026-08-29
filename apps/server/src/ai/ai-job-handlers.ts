import type { AiJobHandler } from "./ai-jobs";
import { extractAiUploadJob } from "./ai-file-jobs";
import { generateMeetingSummary } from "../features/meetings/meeting-summary-service";
import { PermanentAiJobError } from "./ai-jobs";
import { compactAiThreadJob } from "./ai-thread-summary-job";
import { ServiceMutationError } from "../shared/errors/service-mutation-error";

const meetingSummaryJob: AiJobHandler = async ({ env, job, reportProgress }) => {
  if (!job.userId) throw new PermanentAiJobError("Meeting summary job has no owner.");
  const input = job.input as { meetingId?: unknown };
  if (typeof input.meetingId !== "string" || !input.meetingId) {
    throw new PermanentAiJobError("Meeting summary job input is invalid.");
  }
  await reportProgress(10);
  let result;
  try {
    result = await generateMeetingSummary({
      env,
      meetingId: input.meetingId,
      userId: job.userId,
    });
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      throw new PermanentAiJobError(error.message);
    }
    throw error;
  }
  return {
    meetingId: result.meeting?.id ?? input.meetingId,
    status: "ready",
  };
};

export const AI_JOB_HANDLERS: Readonly<Record<string, AiJobHandler>> = {
  "thread-compaction": compactAiThreadJob,
  "meeting-summary": meetingSummaryJob,
  "upload-extraction": extractAiUploadJob,
};
