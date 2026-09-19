import { describe, expect, it, vi } from "vitest";
import {
  createCalendarRealtimeTicket,
  CALENDAR_REALTIME_AUTH_PROTOCOL_PREFIX,
  CALENDAR_REALTIME_PROTOCOL,
} from "@zilobase/server/realtime-api";

import {
  routeCalendarRealtimeRequest,
  type CalendarRealtimeRouteEnv,
} from "../../src/worker/features/calendar-realtime/security";

const secret = "calendar-realtime-route-test-secret";

async function websocketRequest(ticketConnection = "connection-1", urlConnection = ticketConnection) {
  const { ticket } = await createCalendarRealtimeTicket({
    bindingId: ticketConnection,
    accountId: ticketConnection,
    userId: "user-1",
    workspaceId: "workspace-1",
  }, { COLLABORATION_SECRET: secret });
  return new Request(`https://api.zilobase.com/calendar-realtime?binding=${urlConnection}`, {
    headers: {
      "Sec-WebSocket-Protocol": [
        CALENDAR_REALTIME_PROTOCOL,
        `${CALENDAR_REALTIME_AUTH_PROTOCOL_PREFIX}${ticket}`,
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
    CALENDAR_ENABLED: "true",
    CALENDAR_ENABLED_WORKSPACE_IDS: "workspace-1",
    CALENDAR_NOTIFICATION_ROOM: { getByName },
  } satisfies CalendarRealtimeRouteEnv;
  return { env, fetch, getByName };
}

describe("calendar realtime upgrade security", () => {
  it("is unavailable when calendar is disabled", async () => {
    const { env, getByName } = routeEnv();
    const response = await routeCalendarRealtimeRequest(
      await websocketRequest(),
      { ...env, CALENDAR_ENABLED: "false" },
    );

    expect(response.status).toBe(404);
    expect(getByName).not.toHaveBeenCalled();
  });

  it("routes a signed owner ticket to the user-keyed room", async () => {
    const { env, fetch, getByName } = routeEnv();
    const response = await routeCalendarRealtimeRequest(await websocketRequest(), env);

    expect(response.status).toBe(200);
    expect(getByName).toHaveBeenCalledWith("connection-1");
    expect(fetch.mock.calls[0]?.[0].headers.get("x-zilobase-calendar-realtime-claims"))
      .toBeTruthy();
  });

  it("rejects missing and connection-mismatched tickets", async () => {
    const { env, getByName } = routeEnv();
    const missing = new Request(
      "https://api.zilobase.com/calendar-realtime?binding=connection-1",
      { headers: { Upgrade: "websocket" } },
    );

    expect((await routeCalendarRealtimeRequest(missing, env)).status).toBe(401);
    expect((await routeCalendarRealtimeRequest(
      await websocketRequest("connection-2", "connection-1"),
      env,
    )).status).toBe(401);
    expect(getByName).not.toHaveBeenCalled();
  });

  it("fails closed when the Durable Object binding is absent", async () => {
    expect((await routeCalendarRealtimeRequest(await websocketRequest(), {
      BETTER_AUTH_SECRET: secret,
      COLLABORATION_SECRET: secret,
      CALENDAR_ENABLED: "true",
    CALENDAR_ENABLED_WORKSPACE_IDS: "workspace-1",
    })).status).toBe(503);
  });
});
