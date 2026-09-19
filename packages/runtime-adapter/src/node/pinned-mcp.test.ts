import { describe, expect, it, vi } from "vitest";

import {
  buildPinnedMcpRequestOptions,
  isPinnedMcpRemoteAddress,
  resolvePublicNodeMcpAddress,
} from "./pinned-mcp";

describe("Node MCP pinned egress", () => {
  it("selects a deterministic public address and filters private DNS answers", async () => {
    const resolver = vi.fn(async () => [
      "10.0.0.1",
      "93.184.216.35",
      "93.184.216.34",
      "169.254.169.254",
    ]);

    await expect(resolvePublicNodeMcpAddress("MCP.Example.com", resolver))
      .resolves.toBe("93.184.216.34");
    expect(resolver).toHaveBeenCalledWith("mcp.example.com");
  });

  it("fails when DNS returns no usable public address", async () => {
    await expect(resolvePublicNodeMcpAddress("mcp.example.com", async () => []))
      .rejects.toThrow("did not resolve to a public address");
    await expect(resolvePublicNodeMcpAddress("mcp.example.com", async () => [
      "127.0.0.1",
      "::1",
      "invalid",
    ])).rejects.toThrow("did not resolve to a public address");
    await expect(resolvePublicNodeMcpAddress("mcp.example.com", async () => {
      throw new Error("DNS failure");
    })).rejects.toThrow("DNS failure");
  });

  it("accepts public IPv4 and IPv6 literals without calling DNS", async () => {
    const resolver = vi.fn(async () => ["127.0.0.1"]);

    await expect(resolvePublicNodeMcpAddress("93.184.216.34", resolver))
      .resolves.toBe("93.184.216.34");
    await expect(resolvePublicNodeMcpAddress("[2606:4700:4700::1111]", resolver))
      .resolves.toBe("2606:4700:4700::1111");
    expect(resolver).not.toHaveBeenCalled();
  });

  it("connects to the selected address while preserving Host and TLS identity", () => {
    expect(buildPinnedMcpRequestOptions({
      body: "{}",
      headers: { authorization: "Bearer redacted" },
      method: "POST",
      url: "https://mcp.example.com:8443/rpc",
    }, "93.184.216.34")).toMatchObject({
      agent: false,
      headers: {
        authorization: "Bearer redacted",
        host: "mcp.example.com:8443",
      },
      hostname: "93.184.216.34",
      method: "POST",
      path: "/rpc",
      port: 8443,
      rejectUnauthorized: true,
      servername: "mcp.example.com",
    });
  });

  it("fails closed when the connected socket does not match the selected address", () => {
    expect(isPinnedMcpRemoteAddress("::ffff:93.184.216.34", "93.184.216.34")).toBe(true);
    expect(isPinnedMcpRemoteAddress("93.184.216.35", "93.184.216.34")).toBe(false);
  });

  it("rejects non-HTTPS requests defensively", () => {
    expect(() => buildPinnedMcpRequestOptions({
      body: null,
      headers: {},
      method: "GET",
      url: "http://mcp.example.com/rpc",
    }, "93.184.216.34")).toThrow("must use HTTPS");
  });
});
