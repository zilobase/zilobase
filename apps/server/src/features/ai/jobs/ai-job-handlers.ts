import type { AiJobHandler } from "./ai-jobs";
import { extractAiUploadJob } from "../files/ai-file-jobs";
import { generateMeetingSummary } from "../../meetings/meeting-summary-service";
import { PermanentAiJobError } from "./ai-jobs";
import { compactAiThreadJob } from "../chat/ai-thread-summary-job";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import { measureBackgroundProvider } from "../../../infrastructure/background/telemetry";

const meetingSummaryJob: AiJobHandler = async ({ assertLease, env, job, reportProgress }) => {
  if (!job.userId) throw new PermanentAiJobError("Meeting summary job has no owner.");
  const input = job.input as { meetingId?: unknown };
  if (typeof input.meetingId !== "string" || !input.meetingId) {
    throw new PermanentAiJobError("Meeting summary job input is invalid.");
  }
  const meetingId = input.meetingId;
  const userId = job.userId;
  await reportProgress(10);
  await assertLease();
  let result;
  try {
    result = await measureBackgroundProvider(env, "ai.job", () => generateMeetingSummary({
      env,
      meetingId,
      userId,
    }));
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      throw new PermanentAiJobError(error.message);
    }
    throw error;
  }
  return {
    meetingId: result.meeting?.id ?? meetingId,
    status: "ready",
  };
};

export const AI_JOB_HANDLERS: Readonly<Record<string, AiJobHandler>> = {
  "thread-compaction": compactAiThreadJob,
  "meeting-summary": meetingSummaryJob,
  "upload-extraction": extractAiUploadJob,
};
