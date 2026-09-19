import { describe, expect, it, vi } from "vitest";
import {
  createMeetingAudioTicket,
  MEETING_AUDIO_AUTH_PROTOCOL_PREFIX,
  MEETING_AUDIO_PROTOCOL,
} from "@zilobase/server/realtime-api";

import {
  MEETING_AUDIO_CLAIMS_HEADER,
  routeMeetingAudioRequest,
} from "../../src/worker/features/meeting-audio/security";

describe("meeting audio edge security", () => {
  it("verifies and forwards only a meeting-scoped recorder ticket", async () => {
    const secret = "meeting-audio-edge-test-secret";
    const ticket = await createMeetingAudioTicket(
      {
        leaseId: "lease-1",
        meetingId: "meeting-1",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      { BETTER_AUTH_SECRET: secret },
    );
    const openSession = vi.fn(async (claims: { meetingId: string }) => {
      expect(claims.meetingId).toBe("meeting-1");
      return new Response(null, { status: 200 });
    });
    const response = await routeMeetingAudioRequest(
      new Request("https://api.zilobase.com/meeting-audio?meeting=meeting-1", {
        headers: {
          Upgrade: "websocket",
          "Sec-WebSocket-Protocol": `${MEETING_AUDIO_PROTOCOL}, ${MEETING_AUDIO_AUTH_PROTOCOL_PREFIX}${ticket.token}`,
        },
      }),
      {
        BETTER_AUTH_SECRET: secret,
        COLLABORATION_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
      } as never,
      { waitUntil: vi.fn() },
      openSession as never,
    );
    expect(response.status).toBe(200);
    expect(openSession).toHaveBeenCalledOnce();
  });

  it("routes recorder audio into the meeting collaboration Durable Object", async () => {
    const secret = "meeting-audio-edge-test-secret";
    const ticket = await createMeetingAudioTicket(
      {
        leaseId: "lease-1",
        meetingId: "meeting-1",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      { BETTER_AUTH_SECRET: secret },
    );
    const fetch = vi.fn(async (request: Request) => {
      expect(request.headers.get(MEETING_AUDIO_CLAIMS_HEADER)).toBeTruthy();
      return new Response(null, { status: 200 });
    });
    const getByName = vi.fn(() => ({ fetch }));

    const response = await routeMeetingAudioRequest(
      new Request("https://api.zilobase.com/meeting-audio?meeting=meeting-1", {
        headers: {
          Upgrade: "websocket",
          "Sec-WebSocket-Protocol": `${MEETING_AUDIO_PROTOCOL}, ${MEETING_AUDIO_AUTH_PROTOCOL_PREFIX}${ticket.token}`,
        },
      }),
      {
        BETTER_AUTH_SECRET: secret,
        COLLABORATION_RATE_LIMITER: {
          limit: vi.fn(async () => ({ success: true })),
        },
        MEETING_COLLABORATION: { getByName },
      } as never,
    );

    expect(response.status).toBe(200);
    expect(getByName).toHaveBeenCalledWith("meeting:meeting-1");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("rejects a ticket used for a different meeting", async () => {
    const secret = "meeting-audio-edge-test-secret";
    const ticket = await createMeetingAudioTicket(
      {
        leaseId: "lease-1",
        meetingId: "meeting-1",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      { BETTER_AUTH_SECRET: secret },
    );
    const response = await routeMeetingAudioRequest(
      new Request("https://api.zilobase.com/meeting-audio?meeting=meeting-2", {
        headers: {
          Upgrade: "websocket",
          "Sec-WebSocket-Protocol": `${MEETING_AUDIO_PROTOCOL}, ${MEETING_AUDIO_AUTH_PROTOCOL_PREFIX}${ticket.token}`,
        },
      }),
      {
        BETTER_AUTH_SECRET: secret,
        COLLABORATION_RATE_LIMITER: { limit: vi.fn() },
      } as never,
      { waitUntil: vi.fn() },
    );
    expect(response.status).toBe(401);
  });
});
