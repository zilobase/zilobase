import { describe, expect, it, vi } from "vitest";
import { createWorkerMeetings } from "./meetings";

describe("worker Meetings port", () => {
  it("routes recorder and document operations to one named room", async () => {
    const room = {
      appendMeetingTranscript: vi.fn(async () => undefined),
      claimRecorder: vi.fn(async () => ({ leaseId: "lease" })),
      getRecorderState: vi.fn(async () => null),
      releaseRecorder: vi.fn(async () => undefined),
      replaceMeetingSummary: vi.fn(async () => undefined),
      transitionRecorder: vi.fn(async () => ({ leaseId: "lease" })),
    };
    const getByName = vi.fn(() => room);
    const meetings = createWorkerMeetings({
      MEETING_COLLABORATION: { getByName },
    } as never);
    await meetings.applySummary({ content: {}, meetingId: "one", userId: "user" });
    await meetings.applyTranscript({
      meetingId: "one",
      segment: { id: "segment", source: "system", startMs: 0, text: "hello" },
      userId: "user",
    });
    await meetings.get("one");
    expect(getByName).toHaveBeenCalledWith("meeting:one");
    expect(room.replaceMeetingSummary).toHaveBeenCalledOnce();
    expect(room.appendMeetingTranscript).toHaveBeenCalledOnce();
    expect(room.getRecorderState).toHaveBeenCalledOnce();
  });
});
