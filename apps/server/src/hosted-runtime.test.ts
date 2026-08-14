import assert from "node:assert/strict";
import { test, vi } from "vitest";

const { checkReadiness, getZilobaseDiscoveryDocument } = vi.hoisted(() => ({
  checkReadiness: vi.fn(),
  getZilobaseDiscoveryDocument: vi.fn(),
}));

vi.mock("./features/health/readiness", () => ({ checkReadiness }));
vi.mock("./features/instance/service", () => ({
  getZilobaseDiscoveryDocument,
}));

import { createApp } from "./app";

const env = {
  BETTER_AUTH_URL: "https://api.example.com",
  CLIENT_URL: "https://app.example.com",
};

test("the hosted fetch adapter exposes discovery and readiness without a session", async () => {
  getZilobaseDiscoveryDocument.mockResolvedValue({
    apiOrigin: "https://api.example.com",
    desktopAuthorization: {
      authorizationEndpoint: "https://api.example.com/desktop/authorize",
      tokenEndpoint: "https://api.example.com/api/auth/desktop/token",
    },
    displayName: "Example",
    instanceId: "instance-1",
    issuer: "https://api.example.com",
    minimumDesktopVersion: "0.0.30",
    protocolVersion: 1,
    serverVersion: "0.0.30",
    webOrigin: "https://app.example.com",
  });
  checkReadiness.mockResolvedValue({
    checks: { database: "ok", objectStorage: "ok" },
    ok: true,
    service: "zilobase-server",
  });
  const app = createApp();

  const discovery = await app.request(
    "https://api.example.com/.well-known/zilobase",
    {},
    env,
  );
  const ready = await app.request("https://api.example.com/ready", {}, env);
  const desktop = await app.request(
    "https://api.example.com/desktop",
    {},
    env,
  );

  assert.equal(discovery.status, 200);
  assert.equal(discovery.headers.get("cache-control"), "no-store");
  assert.equal((await discovery.json()).instanceId, "instance-1");
  assert.equal(ready.status, 200);
  assert.deepEqual((await ready.json()).checks, {
    database: "ok",
    objectStorage: "ok",
  });
  assert.equal(desktop.status, 200);
  assert.match(await desktop.text(), /zilobase:\/\/connect/);
});
