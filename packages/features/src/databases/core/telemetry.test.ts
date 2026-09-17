import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { databaseMetric } from "./telemetry"

describe("database telemetry", () => {
  it("creates value-free, bounded metrics", () => {
    assert.deepEqual(databaseMetric("rollback", 1, "failure", "command_failure"), {
      event: "database.rollback",
      outcome: "failure",
      reason: "command_failure",
      value: 1,
    })
    assert.equal(databaseMetric("drag_to_paint", Number.POSITIVE_INFINITY), null)
  })
})
