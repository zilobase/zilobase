import { afterEach, describe, expect, it } from "vitest"

import {
  measureDatabaseOperation,
  recordDatabaseCounter,
  recordDatabaseGauge,
  renderPrometheusDatabaseMetrics,
  resetDatabaseMetricsForTest,
} from "./observability"

describe("database observability", () => {
  afterEach(resetDatabaseMetricsForTest)

  it("renders bounded counters, gauges, and durations", async () => {
    recordDatabaseCounter("ordering_conflict", {
      operation: "row.move",
      outcome: "failure",
      scope: "source",
    })
    recordDatabaseGauge("outbox_backlog", 3)
    await measureDatabaseOperation(
      "commit_duration_ms",
      { operation: "row.move", scope: "source" },
      async () => "done",
    )

    const output = renderPrometheusDatabaseMetrics()
    expect(output).toContain("zilobase_database_ordering_conflict")
    expect(output).toContain("zilobase_database_outbox_backlog")
    expect(output).toContain("zilobase_database_commit_duration_ms_count")
    expect(output).not.toContain("propertyId")
    expect(output).not.toContain("value")
  })

  it("records failed operation durations without swallowing errors", async () => {
    await expect(measureDatabaseOperation(
      "enqueue_duration_ms",
      { operation: "row.move" },
      async () => { throw new Error("unavailable") },
    )).rejects.toThrow("unavailable")

    expect(renderPrometheusDatabaseMetrics()).toContain('outcome="failure"')
  })
})
