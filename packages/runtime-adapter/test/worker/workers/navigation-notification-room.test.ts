import { env, evictAllDurableObjects } from "cloudflare:test";
import { afterEach, expect, it } from "vitest";

afterEach(() => evictAllDurableObjects({ webSockets: "close" }));

it("retains the declared class while rejecting navigation WebSocket connections", async () => {
  const stub = env.NAVIGATION_NOTIFICATION_ROOM.getByName("workspace");
  const response = await stub.fetch("https://example.com/navigation-realtime?workspace=workspace", {
    headers: { Upgrade: "websocket" },
  });
  expect(response.status).toBe(410);
  expect(response.webSocket).toBeNull();
  expect(await response.text()).toBe("Navigation realtime retired");
});
