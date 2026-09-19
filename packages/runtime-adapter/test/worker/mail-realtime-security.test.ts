import { describe, expect, it, vi } from "vitest";
import {
  createMailRealtimeTicket,
  MAIL_REALTIME_AUTH_PROTOCOL_PREFIX,
  MAIL_REALTIME_PROTOCOL,
} from "@zilobase/server/realtime-api";

import {
  routeMailRealtimeRequest,
  type MailRealtimeRouteEnv,
} from "../../src/worker/features/mail-realtime/security";

const secret = "mail-realtime-route-test-secret";

async function websocketRequest(ticketConnection = "connection-1", urlConnection = ticketConnection) {
  const { ticket } = await createMailRealtimeTicket({
    bindingId: "binding-1",
    connectionId: ticketConnection,
    userId: "user-1",
    workspaceId: "workspace-1",
  }, { COLLABORATION_SECRET: secret });
  return new Request(`https://api.zilobase.com/mail-realtime?connection=${urlConnection}`, {
    headers: {
      "Sec-WebSocket-Protocol": [
        MAIL_REALTIME_PROTOCOL,
        `${MAIL_REALTIME_AUTH_PROTOCOL_PREFIX}${ticket}`,
      ].join(", "),
      Upgrade: "websocket",
    },
  });
}

function routeEnv() {
  const fetch = vi.fn(async () => new Response("routed"));
  const getByName = vi.fn(() => ({ fetch }));
  const env = {
    BETTER_AUTH_SECRET: secret,
    COLLABORATION_SECRET: secret,
    MAIL_ENABLED: "true",
    MAIL_NOTIFICATION_ROOM: { getByName },
  } satisfies MailRealtimeRouteEnv;
  return { env, fetch, getByName };
}

describe("mail realtime upgrade security", () => {
  it("is unavailable when mail is disabled", async () => {
    const { env, getByName } = routeEnv();
    const response = await routeMailRealtimeRequest(
      await websocketRequest(),
      { ...env, MAIL_ENABLED: "false" },
    );

    expect(response.status).toBe(404);
    expect(getByName).not.toHaveBeenCalled();
  });

  it("routes a signed owner ticket to the user-keyed room", async () => {
    const { env, fetch, getByName } = routeEnv();
    const response = await routeMailRealtimeRequest(await websocketRequest(), env);

    expect(response.status).toBe(200);
    expect(getByName).toHaveBeenCalledWith("user-1");
    expect(fetch.mock.calls[0]?.[0].headers.get("x-zilobase-mail-realtime-claims"))
      .toBeTruthy();
  });

  it("rejects missing and connection-mismatched tickets", async () => {
    const { env, getByName } = routeEnv();
    const missing = new Request(
      "https://api.zilobase.com/mail-realtime?connection=connection-1",
      { headers: { Upgrade: "websocket" } },
    );

    expect((await routeMailRealtimeRequest(missing, env)).status).toBe(401);
    expect((await routeMailRealtimeRequest(
      await websocketRequest("connection-2", "connection-1"),
      env,
    )).status).toBe(401);
    expect(getByName).not.toHaveBeenCalled();
  });

  it("fails closed when the Durable Object binding is absent", async () => {
    expect((await routeMailRealtimeRequest(await websocketRequest(), {
      BETTER_AUTH_SECRET: secret,
      COLLABORATION_SECRET: secret,
      MAIL_ENABLED: "true",
    })).status).toBe(503);
  });
});
