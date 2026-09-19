import { describe, expect, it, vi } from "vitest";
import {
  MAX_COLLABORATION_MESSAGE_BYTES,
  routeCollaborationRequest,
  selectCollaborationWebSocketProtocol,
  type CollaborationRouteEnv,
  validateCollaborationMessage,
} from "../../src/worker/features/collaboration/security";

const websocketRequest = new Request(
  "https://api.zilobase.com/collaboration?document=page%3Apage-1",
  { headers: { Upgrade: "websocket" } },
);
const parsePageId = (documentName: string) =>
  documentName.startsWith("page:") ? documentName.slice(5) : null;

function createRouteEnv(rateLimitSuccess = true) {
  const roomFetch = vi.fn(async () => new Response("routed"));
  const getByName = vi.fn(() => ({ fetch: roomFetch }));
  const limit = vi.fn(async () => ({ success: rateLimitSuccess }));
  const env = {
    COLLABORATION_RATE_LIMITER: { limit },
    PAGE_COLLABORATION: { getByName },
  } satisfies CollaborationRouteEnv;

  return { env, getByName, limit, roomFetch };
}

describe("collaboration upgrade security", () => {
  it("rejects non-upgrade and invalid document requests before authentication", async () => {
    const { env, getByName, limit } = createRouteEnv();
    const authenticate = vi.fn(async () => "user-1");

    expect((await routeCollaborationRequest(
      new Request(websocketRequest, { method: "POST" }),
      env,
      authenticate,
      parsePageId,
    )).status).toBe(405);
    expect((await routeCollaborationRequest(
      new Request(websocketRequest.url),
      env,
      authenticate,
      parsePageId,
    )).status).toBe(426);
    expect((await routeCollaborationRequest(
      new Request("https://api.zilobase.com/collaboration?document=invalid", {
        headers: { Upgrade: "websocket" },
      }),
      env,
      authenticate,
      parsePageId,
    )).status).toBe(400);
    expect((await routeCollaborationRequest(
      new Request(
        `https://api.zilobase.com/collaboration?document=page:${"x".repeat(129)}`,
        { headers: { Upgrade: "websocket" } },
      ),
      env,
      authenticate,
      parsePageId,
    )).status).toBe(400);
    expect(authenticate).not.toHaveBeenCalled();
    expect(limit).not.toHaveBeenCalled();
    expect(getByName).not.toHaveBeenCalled();
  });

  it("rejects anonymous clients before allocating a Durable Object", async () => {
    const { env, getByName, limit } = createRouteEnv();

    const response = await routeCollaborationRequest(
      websocketRequest,
      env,
      async () => null,
      parsePageId,
    );

    expect(response.status).toBe(401);
    expect(limit).not.toHaveBeenCalled();
    expect(getByName).not.toHaveBeenCalled();
  });

  it("rate limits authenticated clients before allocating a Durable Object", async () => {
    const { env, getByName, limit } = createRouteEnv(false);

    const response = await routeCollaborationRequest(
      websocketRequest,
      env,
      async () => "user-1",
      parsePageId,
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(limit).toHaveBeenCalledWith({
      key: "collaboration-connect:user-1",
    });
    expect(getByName).not.toHaveBeenCalled();
  });

  it("routes an authenticated request that is within its rate limit", async () => {
    const { env, getByName, roomFetch } = createRouteEnv();

    const response = await routeCollaborationRequest(
      websocketRequest,
      env,
      async () => "user-1",
      parsePageId,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("routed");
    expect(getByName).toHaveBeenCalledWith("page:page-1");
    expect(roomFetch).toHaveBeenCalledOnce();
  });

  it("routes meeting documents through an isolated namespace", async () => {
    const { env, getByName } = createRouteEnv();
    const meetingRequest = new Request(
      "https://api.zilobase.com/meeting-collaboration?document=meeting%3Ameeting-1",
      { headers: { Upgrade: "websocket" } },
    );

    const response = await routeCollaborationRequest(
      meetingRequest,
      env,
      async () => "user-1",
      (documentName) =>
        documentName.startsWith("meeting:") ? documentName.slice(8) : null,
    );

    expect(response.status).toBe(200);
    expect(getByName).toHaveBeenCalledWith("meeting:meeting-1");
  });
});

describe("collaboration WebSocket message limits", () => {
  it("accepts binary messages at the configured limit", () => {
    const result = validateCollaborationMessage(
      new ArrayBuffer(MAX_COLLABORATION_MESSAGE_BYTES),
    );

    expect(result.ok).toBe(true);
    expect(validateCollaborationMessage(new Uint8Array([1, 2, 3])).ok).toBe(true);
  });

  it("rejects oversized binary messages with close code 1009", () => {
    const result = validateCollaborationMessage(
      new ArrayBuffer(MAX_COLLABORATION_MESSAGE_BYTES + 1),
    );

    expect(result).toEqual({
      code: 1009,
      messageBytes: MAX_COLLABORATION_MESSAGE_BYTES + 1,
      ok: false,
      reason: "Collaboration message is too large",
    });
  });

  it("rejects text messages with close code 1003", () => {
    expect(validateCollaborationMessage("not binary")).toEqual({
      code: 1003,
      messageBytes: null,
      ok: false,
      reason: "Binary WebSocket messages are required",
    });
  });
});

describe("collaboration WebSocket protocol negotiation", () => {
  it("selects the stable collaboration protocol without echoing auth data", () => {
    const headers = new Headers({
      "Sec-WebSocket-Protocol":
        "zilobase.collaboration.v1, zilobase.session.v1.c2Vzc2lvbg",
    });

    expect(selectCollaborationWebSocketProtocol(headers)).toBe(
      "zilobase.collaboration.v1",
    );
  });

  it("does not negotiate a protocol for cookie-authenticated web clients", () => {
    expect(selectCollaborationWebSocketProtocol(new Headers())).toBeNull();
  });
});
