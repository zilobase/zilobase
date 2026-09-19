import { beforeEach, describe, expect, it, vi } from "vitest";

const { routeAgentRequest } = vi.hoisted(() => ({
  routeAgentRequest: vi.fn(),
}));

vi.mock("agents", () => ({ routeAgentRequest }));

import { createWorkerHandler } from "../../src/worker/handler";

describe("Cloudflare worker handler", () => {
  beforeEach(() => {
    routeAgentRequest.mockReset();
  });

  it("loads the app once and adds request timing metadata", async () => {
    const fetch = vi.fn(async () => new Response("app", { status: 201 }));
    const loadApp = vi.fn(async () => ({ fetch }));
    const handler = createWorkerHandler({ loadApp });
    const firstEnv = { binding: "first" };

    const first = await handler.fetch(
      new Request("https://api.example.com/pages", {
        headers: {
          "cf-ray": "ray-1",
          "x-zilobase-request-id": "request-1",
        },
      }),
      firstEnv,
      {},
    );
    const second = await handler.fetch(
      new Request("https://api.example.com/pages"),
      {},
      {},
    );

    expect(await first.text()).toBe("app");
    expect(first.status).toBe(201);
    expect(first.headers.get("x-zilobase-request-id")).toBe("request-1");
    expect(first.headers.get("x-zilobase-worker-path")).toBe("/pages");
    expect(first.headers.get("server-timing")).toMatch(
      /zilobase_app_load;dur=\d+, zilobase_app_fetch;dur=\d+, zilobase_total;dur=\d+/,
    );
    expect(second.headers.get("x-zilobase-request-id")).toBeTruthy();
    expect(loadApp).toHaveBeenCalledOnce();
    expect(loadApp).toHaveBeenCalledWith(firstEnv);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("routes agent requests with authorization, authentication, and CORS", async () => {
    const authorizeAgentRequest = vi.fn();
    const authenticateAgentRequest = vi.fn();
    const getAgentCorsHeaders = vi.fn(() => ({
      "Access-Control-Allow-Origin": "https://app.example.com",
    }));
    const loadApp = vi.fn(async () => ({
      fetch: vi.fn(async () => new Response("app")),
    }));
    const handler = createWorkerHandler({
      authorizeAgentRequest,
      authenticateAgentRequest,
      getAgentCorsHeaders,
      loadApp,
    });
    routeAgentRequest.mockImplementation(async (request, env, options) => {
      expect(env).toEqual({ binding: true });
      expect(options.cors).toEqual({
        "Access-Control-Allow-Origin": "https://app.example.com",
      });
      await options.onBeforeConnect(request, "lobby");
      await options.onBeforeRequest(request, "lobby");
      return new Response("agent");
    });

    const request = new Request("https://api.example.com/agents/chat/thread-1");
    const response = await handler.fetch(request, { binding: true }, {});

    expect(await response.text()).toBe("agent");
    expect(authorizeAgentRequest).toHaveBeenCalledWith(
      request,
      "lobby",
      { binding: true },
    );
    expect(authenticateAgentRequest).toHaveBeenCalledWith(
      request,
      "lobby",
      { binding: true },
    );
    expect(getAgentCorsHeaders).toHaveBeenCalledWith({ binding: true }, request);
    expect(loadApp).not.toHaveBeenCalled();
    expect(response.headers.get("server-timing")).toMatch(
      /zilobase_route_agent;dur=\d+/,
    );
  });

  it("preserves Agent WebSocket upgrade responses", async () => {
    const upgrade = new Response(null);
    const webSocket = { id: "agent-websocket" };
    Object.defineProperties(upgrade, {
      status: { value: 101 },
      webSocket: { value: webSocket },
    });
    routeAgentRequest.mockResolvedValue(upgrade);
    const handler = createWorkerHandler({
      loadApp: async () => ({ fetch: async () => new Response("fallback") }),
    });

    const response = await handler.fetch(
      new Request("https://api.example.com/agents/chat/thread-1"),
      {},
      {},
    );

    expect(response).toBe(upgrade);
    expect((response as Response & { webSocket: unknown }).webSocket).toBe(
      webSocket,
    );
  });

  it("falls through when the agent router declines a matching request", async () => {
    routeAgentRequest.mockResolvedValue(null);
    const appFetch = vi.fn(async () => new Response("fallback"));
    const handler = createWorkerHandler({
      loadApp: async () => ({ fetch: appFetch }),
    });

    const response = await handler.fetch(
      new Request("https://api.example.com/agents"),
      {},
      {},
    );

    expect(await response.text()).toBe("fallback");
    expect(appFetch).toHaveBeenCalledOnce();
    expect(response.headers.get("server-timing")).toMatch(
      /zilobase_route_agent;dur=\d+/,
    );
  });

  it("rethrows request failures", async () => {
    const error = new Error("app failed");
    const handler = createWorkerHandler({
      loadApp: async () => ({
        fetch: async () => {
          throw error;
        },
      }),
    });

    await expect(
      handler.fetch(new Request("https://api.example.com/failure"), {}, {}),
    ).rejects.toBe(error);
  });
});
