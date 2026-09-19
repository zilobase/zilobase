import { describe, expect, it, vi } from "vitest";
import {
  createDatabaseRealtimeTicket,
  DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX,
  DATABASE_REALTIME_PROTOCOL,
} from "@zilobase/server/adapter-api";

import {
  MAX_DATABASE_REALTIME_MESSAGE_BYTES,
  readDatabaseRealtimeClaims,
  routeDatabaseRealtimeRequest,
  type DatabaseRealtimeRouteEnv,
  validateDatabaseRealtimeMessage,
} from "../../src/worker/features/database-realtime/security";

const secret = "database-realtime-route-test-secret";

async function createWebsocketRequest(databaseId = "database-1") {
  const ticket = await createDatabaseRealtimeTicket(
    {
      canEdit: true,
      databaseId,
      user: { id: "user-1", name: "User One" },
      version: 3,
      workspaceId: "workspace-1",
    },
    { COLLABORATION_SECRET: secret },
  );

  return new Request(
    `https://api.zilobase.com/database-collaboration?database=${databaseId}`,
    {
      headers: {
        "cf-connecting-ip": "203.0.113.10",
        "Sec-WebSocket-Protocol": [
          DATABASE_REALTIME_PROTOCOL,
          `${DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX}${ticket.token}`,
        ].join(", "),
        Upgrade: "websocket",
      },
    },
  );
}

function createRouteEnv(rateLimitSuccess = true) {
  const roomFetch = vi.fn(async () => new Response("routed"));
  const getByName = vi.fn(() => ({ fetch: roomFetch }));
  const limit = vi.fn(async () => ({ success: rateLimitSuccess }));
  const env = {
    BETTER_AUTH_SECRET: secret,
    COLLABORATION_SECRET: secret,
    COLLABORATION_RATE_LIMITER: { limit },
    DATABASE_COLLABORATION: { getByName },
  } satisfies DatabaseRealtimeRouteEnv;

  return { env, getByName, limit, roomFetch };
}

describe("database realtime upgrade security", () => {
  it("rejects non-upgrade and invalid database requests", async () => {
    const { env, getByName, limit } = createRouteEnv();
    const request = await createWebsocketRequest();

    expect((await routeDatabaseRealtimeRequest(
      new Request(request, { method: "POST" }),
      env,
    )).status).toBe(405);
    expect((await routeDatabaseRealtimeRequest(
      new Request(request.url),
      env,
    )).status).toBe(426);
    expect((await routeDatabaseRealtimeRequest(
      new Request("https://api.zilobase.com/database-collaboration", {
        headers: { Upgrade: "websocket" },
      }),
      env,
    )).status).toBe(400);
    expect(getByName).not.toHaveBeenCalled();
    expect(limit).not.toHaveBeenCalled();
  });

  it("rate limits upgrades by connecting address", async () => {
    const { env, getByName, limit } = createRouteEnv(false);
    const response = await routeDatabaseRealtimeRequest(
      await createWebsocketRequest(),
      env,
    );

    expect(response.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({
      key: "database-realtime-connect:203.0.113.10",
    });
    expect(getByName).not.toHaveBeenCalled();
  });

  it("routes an upgrade to the room for signed-ticket authentication", async () => {
    const { env, getByName, roomFetch } = createRouteEnv();
    const response = await routeDatabaseRealtimeRequest(
      await createWebsocketRequest(),
      env,
    );

    expect(response.status).toBe(200);
    expect(getByName).toHaveBeenCalledWith("database-1");
    expect(roomFetch).toHaveBeenCalledOnce();
    expect(
      roomFetch.mock.calls[0]?.[0].headers.get(
        "x-zilobase-database-realtime-claims",
      ),
    ).toBeTruthy();
  });

  it("rejects missing or mismatched tickets before creating a room", async () => {
    const { env, getByName } = createRouteEnv();
    const missing = new Request(
      "https://api.zilobase.com/database-collaboration?database=database-1",
      { headers: { Upgrade: "websocket" } },
    );
    const mismatched = await createWebsocketRequest("database-2");
    const mismatchedUrl = new URL(mismatched.url);
    mismatchedUrl.searchParams.set("database", "database-1");

    expect(
      (await routeDatabaseRealtimeRequest(missing, env)).status,
    ).toBe(401);
    expect(
      (await routeDatabaseRealtimeRequest(
        new Request(mismatchedUrl, mismatched),
        env,
      )).status,
    ).toBe(401);
    expect(getByName).not.toHaveBeenCalled();
  });

  it("rate limits an authenticated user before allocating a room", async () => {
    const { env, getByName, limit } = createRouteEnv();
    limit
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false });

    const response = await routeDatabaseRealtimeRequest(
      await createWebsocketRequest(),
      env,
    );

    expect(response.status).toBe(429);
    expect(getByName).not.toHaveBeenCalled();
    expect(limit).toHaveBeenNthCalledWith(2, {
      key: "database-realtime-user:user-1:database-1",
    });
  });

  it("decodes only complete validated room claims", () => {
    const headers = new Headers();
    headers.set(
      "x-zilobase-database-realtime-claims",
      encodeURIComponent(JSON.stringify({
        canEdit: true,
        databaseId: "database-1",
        exp: Date.now() + 60_000,
        sessionId: "session-1",
        user: { id: "user-1" },
        workspaceId: "workspace-1",
      })),
    );
    expect(readDatabaseRealtimeClaims(headers)?.databaseId).toBe("database-1");

    headers.set("x-zilobase-database-realtime-claims", "%not-json");
    expect(readDatabaseRealtimeClaims(headers)).toBeNull();
    headers.set(
      "x-zilobase-database-realtime-claims",
      encodeURIComponent(JSON.stringify({ databaseId: "database-1" })),
    );
    expect(readDatabaseRealtimeClaims(headers)).toBeNull();
    expect(readDatabaseRealtimeClaims(new Headers())).toBeNull();
  });
});

describe("database realtime message validation", () => {
  it("accepts JSON object messages", () => {
    expect(validateDatabaseRealtimeMessage('{"type":"presence.update"}')).toEqual({
      message: { type: "presence.update" },
      ok: true,
    });
  });

  it("rejects binary, malformed, and oversized messages", () => {
    expect(validateDatabaseRealtimeMessage(new ArrayBuffer(1)).ok).toBe(false);
    expect(validateDatabaseRealtimeMessage("not-json").ok).toBe(false);
    expect(validateDatabaseRealtimeMessage("null").ok).toBe(false);
    expect(
      validateDatabaseRealtimeMessage(
        JSON.stringify({ value: "x".repeat(MAX_DATABASE_REALTIME_MESSAGE_BYTES) }),
      ),
    ).toMatchObject({ code: 1009, ok: false });
  });
});
