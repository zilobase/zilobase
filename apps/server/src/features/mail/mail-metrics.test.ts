import assert from "node:assert/strict"
import { test, vi } from "vitest"

import { recordMailMetric } from "./mail-metrics"

test("mail metrics emit allowlisted non-PII fields and opaque connection IDs", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => undefined)
  try {
    await recordMailMetric("sync", {
      code: "quota_exceeded",
      connectionId: "connection-secret-id",
      durationMs: 12.6,
      mode: "incremental",
      outcome: "success",
      status: 200,
    })
    const serialized = String(log.mock.calls[0]?.[0])
    assert.doesNotMatch(serialized, /connection-secret-id/)
    assert.doesNotMatch(serialized, /token|subject|address|body/i)
    assert.deepEqual(JSON.parse(serialized), {
      code: "quota_exceeded",
      connection: "bfaaf5304cdb1f8a",
      duration_ms: 13,
      event: "mail.sync",
      mode: "incremental",
      outcome: "success",
      status: 200,
    })
  } finally {
    log.mockRestore()
  }
})
