import { describe, expect, it, vi } from "vitest";

import {
  isBlockedAddress,
  resolvePublicWebhookTarget,
  sendPinnedWebhook,
  validateWebhookHeaderName,
  WebhookEgressError,
} from "./webhook-egress";

describe("automation webhook egress", () => {
  it("blocks private, metadata, mapped, multicast, and documentation addresses", () => {
    for (const address of [
      "0.0.0.0", "10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1",
      "192.168.1.1", "100.100.100.200", "224.0.0.1", "::1", "fc00::1",
      "fe80::1", "ff02::1", "::ffff:127.0.0.1", "2001:db8::1",
    ]) expect(isBlockedAddress(address), address).toBe(true);
    expect(isBlockedAddress("93.184.216.34")).toBe(false);
    expect(isBlockedAddress("2606:2800:220:1:248:1893:25c8:1946")).toBe(false);
  });

  it("rejects credentials, redirects, reserved headers, and DNS rebinding candidates", async () => {
    await expect(resolvePublicWebhookTarget("https://user:pass@example.com/hook", {
      resolver: async () => ["93.184.216.34"],
    })).rejects.toMatchObject({ code: "AUTOMATION_WEBHOOK_URL_INVALID" });
    await expect(resolvePublicWebhookTarget("https://example.com/hook", {
      resolver: async () => ["93.184.216.34", "169.254.169.254"],
    })).rejects.toMatchObject({ code: "AUTOMATION_WEBHOOK_PRIVATE_DESTINATION" });
    expect(() => validateWebhookHeaderName("Host")).toThrow(WebhookEgressError);
    expect(() => validateWebhookHeaderName("X-Zilobase-Delivery-Id")).toThrow(WebhookEgressError);
    await expect(sendPinnedWebhook({
      body: "{}",
      headers: {},
      resolver: async () => ["93.184.216.34"],
      transport: async () => new Response(null, { headers: { location: "https://private.test" }, status: 302 }),
      url: "https://example.com/hook",
    })).rejects.toMatchObject({ code: "AUTOMATION_WEBHOOK_REDIRECT_REJECTED", retryable: false });
  });

  it("pins one verified address, caps responses, and classifies retries", async () => {
    const transport = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(sendPinnedWebhook({
      body: "{}",
      headers: { "x-test": "value" },
      resolver: async () => ["93.184.216.35", "93.184.216.34"],
      transport,
      url: "https://example.com/hook",
    })).resolves.toEqual({ status: 204 });
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({ pinnedAddress: "93.184.216.34" }));

    await expect(sendPinnedWebhook({
      body: "{}",
      headers: {},
      resolver: async () => ["93.184.216.34"],
      transport: async () => new Response(null, { headers: { "retry-after": "2" }, status: 429 }),
      url: "https://example.com/hook",
    })).rejects.toMatchObject({ responseStatus: 429, retryAfterMs: 2_000, retryable: true });
    await expect(sendPinnedWebhook({
      body: "{}",
      headers: {},
      resolver: async () => ["93.184.216.34"],
      transport: async () => new Response(null, { status: 400 }),
      url: "https://example.com/hook",
    })).rejects.toMatchObject({ responseStatus: 400, retryable: false });
  });

  it("permits self-hosted HTTP only for an exact configured domain", async () => {
    await expect(resolvePublicWebhookTarget("http://hooks.internal.example/hook", {
      allowHttpDomains: new Set(["hooks.internal.example"]),
      resolver: async () => ["93.184.216.34"],
    })).resolves.toMatchObject({ pinnedAddress: "93.184.216.34" });
    await expect(resolvePublicWebhookTarget("http://sub.hooks.internal.example/hook", {
      allowHttpDomains: new Set(["hooks.internal.example"]),
      resolver: async () => ["93.184.216.34"],
    })).rejects.toMatchObject({ code: "AUTOMATION_WEBHOOK_HTTPS_REQUIRED" });
  });
});
