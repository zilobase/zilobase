import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

const state = vi.hoisted(() => ({
  meeting: {} as Record<string, unknown>,
  consent: true,
  allowed: true,
  rejectUpdate: false,
  claim: vi.fn(),
  transition: vi.fn(),
  release: vi.fn(),
  append: vi.fn(),
  segments: [] as Record<string, unknown>[],
  documents: [] as Record<string, unknown>[],
  failDocument: false,
}));
vi.mock("../../access", () => ({
  canAccessPageInWorkspace: async () => state.allowed,
}));
vi.mock("../../../infrastructure/runtime/runtime-adapter", () => ({
  getRuntimePorts: () => ({
    meetings: {
      claim: state.claim,
      transition: state.transition,
      release: state.release,
    },
  }),
}));
vi.mock("../../collaboration/service", () => ({
  appendMeetingTranscript: state.append,
}));
vi.mock("../../../infrastructure/database", () => {
  const rows = (table: Parameters<typeof getTableName>[0]) => {
    switch (getTableName(table)) {
      case "meeting":
        return [
          {
            ...structuredClone(state.meeting),
            revision: state.meeting.transcriptRevision,
          },
        ];
      case "meeting_consent_event":
        return state.consent ? [{ acknowledgedAt: new Date() }] : [];
      case "meeting_transcript_segment":
        return structuredClone(state.segments);
      default:
        return [];
    }
  };
  const database = {
    select: () => ({
      from: (table: Parameters<typeof getTableName>[0]) => {
        const query = {
          where: () => query,
          orderBy: () => query,
          limit: async () => rows(table),
        };
        return query;
      },
    }),
    update: () => ({
      set: (value: Record<string, unknown>) => ({
        where: () => {
          if (!state.rejectUpdate) Object.assign(state.meeting, value);
          const query = {
            returning: async () =>
              state.rejectUpdate ? [] : [structuredClone(state.meeting)],
            then: (resolve: (value: unknown) => unknown) => resolve([]),
          };
          return query;
        },
      }),
    }),
    insert: (table: Parameters<typeof getTableName>[0]) => ({
      values: (value: Record<string, unknown> | Record<string, unknown>[]) => {
        const inserted: Record<string, unknown>[] = [];
        const apply = () => {
          if (getTableName(table) === "meeting_collaboration_document") {
            if (state.failDocument) throw new Error("Document storage failed");
            state.documents.push(
              structuredClone(value as Record<string, unknown>),
            );
          } else {
            for (const row of Array.isArray(value) ? value : [value]) {
              if (
                state.segments.some(
                  (existing) => existing.providerItemId === row.providerItemId,
                )
              )
                continue;
              state.segments.push(structuredClone(row));
              inserted.push(row);
            }
          }
          return inserted;
        };
        const query = {
          onConflictDoNothing: () => query,
          onConflictDoUpdate: () => query,
          returning: async () => apply(),
          then: (resolve: (value: unknown) => unknown) => resolve(apply()),
        };
        return query;
      },
    }),
    transaction: async (callback: (tx: unknown) => unknown) => {
      const snapshot = structuredClone({
        meeting: state.meeting,
        segments: state.segments,
        documents: state.documents,
      });
      try {
        return await callback(database);
      } catch (error) {
        Object.assign(state, snapshot);
        throw error;
      }
    },
  };
  return { db: database };
});

import {
  appendMeetingTranscriptSegment,
  claimMeetingRecorder,
  heartbeatMeetingRecorder,
  persistMeetingTranscriptSession,
  releaseMeetingRecorder,
  transitionMeeting,
} from "./meeting-service";

const actor = { meetingId: "meeting", userId: "user", leaseId: "lease" };
beforeEach(() => {
  vi.clearAllMocks();
  state.meeting = {
    id: "meeting",
    pageId: "page",
    workspaceId: "workspace",
    status: "idle",
    recorderId: "user",
    recorderLeaseId: "lease",
    recorderLeaseExpiresAt: new Date(Date.now() + 60_000),
    transcriptRevision: 3,
  };
  state.consent = true;
  state.allowed = true;
  state.rejectUpdate = false;
  state.failDocument = false;
  state.segments = [];
  state.documents = [];
  state.claim.mockResolvedValue({
    leaseId: "runtime-lease",
    recorderId: "user",
    expiresAt: Date.now() + 60_000,
  });
});

describe("meeting recorder coordination", () => {
  it("requires access and recent consent before a runtime claim", async () => {
    state.allowed = false;
    await expect(
      claimMeetingRecorder({ ...actor, env: {} }),
    ).rejects.toMatchObject({ status: 403 });
    state.allowed = true;
    state.consent = false;
    await expect(
      claimMeetingRecorder({ ...actor, env: {} }),
    ).rejects.toMatchObject({ status: 409 });
    expect(state.claim).not.toHaveBeenCalled();
  });
  it("returns the runtime lease bound to the authenticated meeting scope", async () => {
    const result = await claimMeetingRecorder({ ...actor, env: {} });
    expect(result.leaseId).toBe("runtime-lease");
    expect(result.leaseExpiresAt).toBeInstanceOf(Date);
    expect(state.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingId: "meeting",
        workspaceId: "workspace",
        userId: "user",
      }),
    );
  });
  it("archives an interrupted active recording before allowing another claim", async () => {
    state.meeting.status = "paused";
    state.meeting.recorderLeaseExpiresAt = new Date(0);
    state.meeting.durationMs = 123;
    await expect(claimMeetingRecorder(actor)).rejects.toMatchObject({
      status: 409,
    });
    expect(state.meeting).toMatchObject({
      status: "processing",
      recorderId: null,
      recorderLeaseId: null,
      durationMs: 123,
    });
  });
  it("rejects a lost renewal or release instead of claiming ownership", async () => {
    state.rejectUpdate = true;
    await expect(heartbeatMeetingRecorder(actor)).rejects.toMatchObject({
      status: 409,
    });
    await expect(releaseMeetingRecorder(actor)).rejects.toMatchObject({
      status: 409,
    });
  });
  it("maps runtime lease conflicts to 409 and preserves unrelated provider errors", async () => {
    state.claim.mockRejectedValueOnce(
      new Error("Another collaborator is recording"),
    );
    await expect(
      claimMeetingRecorder({ ...actor, env: {} }),
    ).rejects.toMatchObject({ status: 409 });
    const failure = new Error("Runtime unavailable");
    state.claim.mockRejectedValueOnce(failure);
    await expect(claimMeetingRecorder({ ...actor, env: {} })).rejects.toBe(
      failure,
    );
  });
  it("treats repeated stop after archival as complete without another runtime action", async () => {
    state.meeting.status = "completed";
    expect(
      (await transitionMeeting({ ...actor, action: "stop", env: {} })).status,
    ).toBe("completed");
    expect(state.transition).not.toHaveBeenCalled();
  });
  it("rejects lifecycle commands from a replacement lease", async () => {
    await expect(
      transitionMeeting({ ...actor, leaseId: "old", action: "start" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(state.meeting.status).toBe("idle");
  });
});

describe("meeting transcript persistence", () => {
  it("reuses provider segment identity and reapplies its persisted content", async () => {
    const input = {
      ...actor,
      env: {},
      providerItemId: "provider-item",
      sequence: 1,
      source: "microphone" as const,
      startMs: 10,
      endMs: 20,
      text: " First ",
    };
    const first = await appendMeetingTranscriptSegment(input);
    const duplicate = await appendMeetingTranscriptSegment({
      ...input,
      text: "Replacement",
    });
    expect(duplicate?.id).toBe(first?.id);
    expect(state.segments).toHaveLength(1);
    expect(state.append).toHaveBeenLastCalledWith(
      expect.objectContaining({
        segment: expect.objectContaining({ text: "First", startMs: 10 }),
      }),
    );
  });
  it("persists a complete session and finalization in one transaction", async () => {
    const result = await persistMeetingTranscriptSession({
      meetingId: "meeting",
      segments: [
        {
          id: "segment",
          providerItemId: "provider",
          sequence: 2,
          source: "system",
          startMs: 10,
          endMs: 30,
          text: " Transcript ",
        },
      ],
      yjsState: new Uint8Array([1, 2]),
      finalize: { durationMs: 500, startedAt: 1000, stoppedAt: 1500 },
    });
    expect(result).toEqual({ revision: 3, segmentCount: 1 });
    expect(state.segments[0]).toMatchObject({
      text: "Transcript",
      revision: 3,
      sequence: 2,
    });
    expect(state.documents).toHaveLength(1);
    expect(state.meeting).toMatchObject({
      status: "processing",
      recorderLeaseId: null,
      durationMs: 500,
    });
  });
  it("rolls segment writes back if the collaborative document cannot be saved", async () => {
    state.failDocument = true;
    await expect(
      persistMeetingTranscriptSession({
        meetingId: "meeting",
        segments: [
          {
            id: "segment",
            providerItemId: "provider",
            sequence: 1,
            source: "microphone",
            startMs: 0,
            endMs: 5,
            text: "Text",
          },
        ],
        yjsState: new Uint8Array(),
      }),
    ).rejects.toThrow("Document storage failed");
    expect(state.segments).toHaveLength(0);
    expect(state.meeting.status).toBe("idle");
  });
});
