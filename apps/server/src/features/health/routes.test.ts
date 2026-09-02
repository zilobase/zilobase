import assert from "node:assert/strict";
import { test, vi } from "vitest";

const { checkReadiness } = vi.hoisted(() => ({
  checkReadiness: vi.fn(),
}));

vi.mock("./readiness", () => ({ checkReadiness }));

import { healthRoutes } from "./routes";

test("root and health probes return the stable service contract", async () => {
  for (const path of ["/", "/health"]) {
    const response = await healthRoutes.request(path);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      service: "zilobase-server",
    });
  }
});

test("automation operations health is hidden without its bearer token", async () => {
  const response = await healthRoutes.request("/health/automations");
  assert.equal(response.status, 404);
});

test("ready returns dependency status and a retryable failure", async () => {
  checkReadiness.mockResolvedValueOnce({
    checks: { database: "ok", objectStorage: "ok", realtime: "ok" },
    ok: true,
    service: "zilobase-server",
  });
  const ready = await healthRoutes.request("/ready");
  assert.equal(ready.status, 200);

  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  checkReadiness.mockResolvedValueOnce({
    checks: { database: "unavailable", objectStorage: "ok", realtime: "ok" },
    ok: false,
    service: "zilobase-server",
  });
  const unavailable = await healthRoutes.request("/ready");

  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get("retry-after"), "5");
  assert.deepEqual(await unavailable.json(), {
    checks: { database: "unavailable", objectStorage: "ok", realtime: "ok" },
    ok: false,
    service: "zilobase-server",
  });
  warn.mockRestore();
});
