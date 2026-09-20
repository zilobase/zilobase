import type { Meetings } from "@zilobase/runtime-ports";
import type { WorkerEnvBindings } from "./bindings";

export function createWorkerMeetings(env: WorkerEnvBindings): Meetings {
  const room = (meetingId: string) => {
    const namespace = env.MEETING_COLLABORATION;
    if (!namespace) throw new Error("MEETING_COLLABORATION binding is required");
    return namespace.getByName(`meeting:${meetingId}`);
  };
  return {
    claim: (input) => room(input.meetingId).claimRecorder(input),
    async transition(input) {
      if (!input.leaseId) throw new Error("Recorder lease is required");
      return room(input.meetingId).transitionRecorder({
        ...input,
        leaseId: input.leaseId,
      });
    },
    async release(input) {
      if (!input.leaseId) throw new Error("Recorder lease is required");
      await room(input.meetingId).releaseRecorder({
        ...input,
        leaseId: input.leaseId,
      });
    },
    get: (meetingId) => room(meetingId).getRecorderState(),
    async applyTranscript(input) {
      await room(input.meetingId).appendMeetingTranscript(
        input.draftItemId,
        input.meetingId,
        input.segment,
        input.userId,
      );
    },
    async applySummary(input) {
      await room(input.meetingId).replaceMeetingSummary(
        input.content,
        input.meetingId,
        input.userId,
      );
    },
  };
}
