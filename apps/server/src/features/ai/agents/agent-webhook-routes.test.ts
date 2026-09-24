import { describe, expect, it, vi } from "vitest";
import { aiAgentWebhookRoutes } from "./agent-webhook-routes";

vi.mock("../../../infrastructure/database", () => ({ db: {} }));
vi.mock("./agent-trigger-service", () => ({ acceptAgentEvent: vi.fn() }));

const env = {
  AI_CUSTOM_AGENTS_ENABLED: "true",
  AI_CUSTOM_AGENT_EXTERNAL_EVENTS_ENABLED: "true",
};
const path = "/agents/agent/hooks/trigger";

describe("inbound agent webhook boundary", () => {
  it("hides disabled endpoints", async () => {
    const response = await aiAgentWebhookRoutes.request(path, { method: "POST" }, {});
    expect(response.status).toBe(404);
  });
  it("rejects oversized declared bodies", async () => {
    const response = await aiAgentWebhookRoutes.request(
      path,
      { method: "POST", headers: { "content-length": "1048577" } },
      env,
    );
    expect(response.status).toBe(413);
  });
  it("bounds chunked bodies without trusting content-length", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024));
        controller.enqueue(new Uint8Array(1));
      },
      cancel,
    });
    const request = new Request(`http://localhost${path}`, {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    const response = await aiAgentWebhookRoutes.fetch(request, env);
    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it.each(["", "not-a-date", "2020-01-01"])(
    "rejects invalid or stale delivery timestamp %s",
    async (timestamp) => {
      const response = await aiAgentWebhookRoutes.request(
        path,
        {
          method: "POST",
          body: "{}",
          headers: {
            "x-zilobase-timestamp": timestamp,
            "x-zilobase-delivery": "delivery",
          },
        },
        env,
      );
      expect(response.status).toBe(401);
    },
  );
});
