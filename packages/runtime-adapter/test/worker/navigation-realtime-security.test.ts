import { describe, expect, it, vi } from "vitest";
import {
  createNavigationRealtimeTicket,
  NAVIGATION_REALTIME_AUTH_PROTOCOL_PREFIX,
  NAVIGATION_REALTIME_PROTOCOL,
} from "@zilobase/server/realtime-api";

import {
  routeNavigationRealtimeRequest,
  type NavigationRealtimeRouteEnv,
} from "../../src/worker/features/navigation-realtime/security";

const secret = "navigation-realtime-route-test-secret";

async function websocketRequest(
  ticketWorkspace = "workspace-1",
  urlWorkspace = ticketWorkspace,
) {
  const { token } = await createNavigationRealtimeTicket({
    userId: "user-1",
    workspaceId: ticketWorkspace,
  }, { COLLABORATION_SECRET: secret });
  return new Request(
    `https://api.zilobase.com/navigation-realtime?workspace=${urlWorkspace}`,
    {
      headers: {
        "Sec-WebSocket-Protocol": [
          NAVIGATION_REALTIME_PROTOCOL,
          `${NAVIGATION_REALTIME_AUTH_PROTOCOL_PREFIX}${token}`,
        ].join(", "),
        Upgrade: "websocket",
      },
    },
  );
}

function routeEnv() {
  const fetch = vi.fn(async () => new Response("routed"));
  const getByName = vi.fn(() => ({ fetch }));
  const env = {
    BETTER_AUTH_SECRET: secret,
    COLLABORATION_SECRET: secret,
    NAVIGATION_NOTIFICATION_ROOM: { getByName },
  } satisfies NavigationRealtimeRouteEnv;
  return { env, fetch, getByName };
}

describe("navigation realtime upgrade security", () => {
  it("routes a signed ticket to its workspace room", async () => {
    const { env, fetch, getByName } = routeEnv();
    const response = await routeNavigationRealtimeRequest(
      await websocketRequest(),
      env,
    );

    expect(response.status).toBe(200);
    expect(getByName).toHaveBeenCalledWith("workspace-1");
    expect(fetch.mock.calls[0]?.[0].headers.get(
      "x-zilobase-navigation-realtime-claims",
    )).toBeTruthy();
  });

  it("rejects missing and workspace-mismatched tickets", async () => {
    const { env, getByName } = routeEnv();
    const missing = new Request(
      "https://api.zilobase.com/navigation-realtime?workspace=workspace-1",
      { headers: { Upgrade: "websocket" } },
    );

    expect((await routeNavigationRealtimeRequest(missing, env)).status).toBe(401);
    expect((await routeNavigationRealtimeRequest(
      await websocketRequest("workspace-2", "workspace-1"),
      env,
    )).status).toBe(401);
    expect(getByName).not.toHaveBeenCalled();
  });

  it("fails closed when the room binding is absent", async () => {
    expect((await routeNavigationRealtimeRequest(await websocketRequest(), {
      BETTER_AUTH_SECRET: secret,
      COLLABORATION_SECRET: secret,
    })).status).toBe(503);
  });
});
