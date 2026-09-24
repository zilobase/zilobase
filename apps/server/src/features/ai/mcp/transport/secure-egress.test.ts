import { describe, expect, it, vi } from "vitest";

import {
  createSecureMcpFetch,
  McpEgressError,
  normalizeMcpEndpoint,
  validateMcpCustomHeaderName,
} from "./secure-egress";

describe("MCP secure egress", () => {
  it("normalizes exact HTTPS endpoints and rejects URL-carried secrets", () => {
    expect(normalizeMcpEndpoint("https://MCP.Example.com:443/rpc")).toBe(
      "https://mcp.example.com/rpc",
    );
    for (const url of [
      "http://mcp.example.com/rpc",
      "https://user:pass@mcp.example.com/rpc",
      "https://mcp.example.com/rpc?token=secret",
      "https://mcp.example.com/rpc#fragment",
    ]) {
      expect(() => normalizeMcpEndpoint(url), url).toThrow(McpEgressError);
    }
  });

  it("rejects local and reserved literal destinations", () => {
    for (const hostname of [
      "localhost",
      "localhost.",
      "intranet",
      "service.internal",
      "service.internal.",
      "127.0.0.1",
      "[::1]",
    ]) {
      expect(() => normalizeMcpEndpoint(`https://${hostname}/mcp`)).toThrow(McpEgressError);
    }
  });

  it("releases unread redirect bodies even when rejecting the destination", async () => {
    const cancel = vi.fn();
    const fetchFn = createSecureMcpFetch({
      approvedUrls: new Set(["https://mcp.example.com/start"]),
      transport: async () =>
        new Response(new ReadableStream({ cancel }), {
          status: 302,
          headers: { location: "https://unapproved.example.com/" },
        }),
    });
    await expect(fetchFn("https://mcp.example.com/start")).rejects.toThrow(McpEgressError);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects reserved custom headers", () => {
    expect(validateMcpCustomHeaderName("X-Provider-Key")).toBe("x-provider-key");
    for (const header of [
      "Host",
      "Cookie",
      "Content-Length",
      "Forwarded",
      "X-Forwarded-For",
      "Mcp-Session-Id",
      "Sec-Fetch-Site",
    ]) {
      expect(() => validateMcpCustomHeaderName(header), header).toThrow(McpEgressError);
    }
  });

  it("follows approved same-origin redirects without delegating redirect handling", async () => {
    const requests: Array<{ body: string | null; method: string; url: string }> = [];
    const fetchFn = createSecureMcpFetch({
      approvedUrls: new Set(["https://mcp.example.com/start", "https://mcp.example.com/final"]),
      transport: async (request) => {
        requests.push({ body: request.body, method: request.method, url: request.url });
        return request.url.endsWith("/start")
          ? new Response(null, { headers: { location: "/final" }, status: 303 })
          : new Response("ok");
      },
    });

    await expect(
      fetchFn("https://mcp.example.com/start", {
        body: '{"query":"safe"}',
        headers: { authorization: "Bearer secret", "content-type": "application/json" },
        method: "POST",
      }),
    ).resolves.toMatchObject({ status: 200 });
    expect(requests).toEqual([
      { body: '{"query":"safe"}', method: "POST", url: "https://mcp.example.com/start" },
      { body: null, method: "GET", url: "https://mcp.example.com/final" },
    ]);
  });

  it("rejects cross-origin redirects before credentials or bodies can be replayed", async () => {
    const transport = vi.fn(
      async () =>
        new Response(null, {
          headers: { location: "https://attacker.example/mcp" },
          status: 307,
        }),
    );
    const fetchFn = createSecureMcpFetch({
      allowAnyPublicHttps: true,
      approvedUrls: new Set(),
      transport,
    });

    await expect(
      fetchFn("https://mcp.example.com/start", {
        body: "oauth_secret=redacted",
        headers: { authorization: "Bearer redacted" },
        method: "POST",
      }),
    ).rejects.toMatchObject({ code: "mcp_redirect_rejected" });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("preserves same-origin 307 requests and enforces the redirect limit", async () => {
    const requests: Array<{ body: string | null; method: string; url: string }> = [];
    const approvedUrls = new Set(
      Array.from({ length: 5 }, (_, index) => `https://mcp.example.com/${index}`),
    );
    const fetchFn = createSecureMcpFetch({
      approvedUrls,
      transport: async (request) => {
        requests.push({ body: request.body, method: request.method, url: request.url });
        const current = Number(new URL(request.url).pathname.slice(1));
        return new Response(null, {
          headers: { location: `/${current + 1}` },
          status: 307,
        });
      },
    });

    await expect(
      fetchFn("https://mcp.example.com/0", {
        body: '{"query":"safe"}',
        method: "POST",
      }),
    ).rejects.toMatchObject({ code: "mcp_redirect_rejected" });
    expect(requests).toHaveLength(4);
    expect(
      requests.every((request) => request.body === '{"query":"safe"}' && request.method === "POST"),
    ).toBe(true);
  });

  it("rejects unapproved redirect targets and oversized request and response bodies", async () => {
    const redirecting = createSecureMcpFetch({
      approvedUrls: new Set(["https://mcp.example.com/start"]),
      transport: async () => new Response(null, { headers: { location: "/other" }, status: 302 }),
    });
    await expect(redirecting("https://mcp.example.com/start")).rejects.toMatchObject({
      code: "mcp_endpoint_not_approved",
    });

    const fetchFn = createSecureMcpFetch({
      approvedUrls: new Set(["https://mcp.example.com/rpc"]),
      transport: async () => new Response(new Uint8Array(5 * 1024 * 1024 + 1)),
    });
    await expect(
      fetchFn("https://mcp.example.com/rpc", {
        body: "x".repeat(1024 * 1024 + 1),
        method: "POST",
      }),
    ).rejects.toMatchObject({ code: "mcp_request_too_large" });

    const response = await fetchFn("https://mcp.example.com/rpc");
    await expect(response.arrayBuffer()).rejects.toMatchObject({ code: "mcp_response_too_large" });
  });
});
