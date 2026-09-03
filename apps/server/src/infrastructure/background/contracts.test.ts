import { describe, expect, it } from "vitest";

import {
  backgroundTaskLane,
  createBackgroundTask,
  parseBackgroundTask,
  runWithBackgroundTraceContext,
} from "./contracts";

describe("background task v1", () => {
  it("routes every kind to an isolated lane", () => {
    expect(backgroundTaskLane("automation.event_window")).toBe("fast");
    expect(backgroundTaskLane("automation.run")).toBe("automation");
    expect(backgroundTaskLane("ai.job")).toBe("ai");
    expect(backgroundTaskLane("mail.index")).toBe("mail");
  });

  it("rejects malformed, unknown, and cross-cell messages", () => {
    const task = createBackgroundTask({
      env: { ZILOBASE_CELL_ID: "cell-a" },
      kind: "ai.job",
      resourceId: "job-1",
    });
    expect(parseBackgroundTask(task, "cell-a")).toEqual({ ok: true, task });
    expect(parseBackgroundTask({ ...task, version: 2 }, "cell-a")).toEqual({
      errorCode: "BACKGROUND_TASK_VERSION_UNSUPPORTED",
      ok: false,
    });
    expect(parseBackgroundTask(task, "cell-b")).toEqual({
      errorCode: "BACKGROUND_TASK_CELL_MISMATCH",
      ok: false,
    });
    expect(parseBackgroundTask({ ...task, kind: "unknown" }, "cell-a")).toEqual({
      errorCode: "BACKGROUND_TASK_KIND_INVALID",
      ok: false,
    });
  });

  it("propagates a validated active W3C trace context", async () => {
    const task = await runWithBackgroundTraceContext({
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      tracestate: "vendor=value",
    }, async () => createBackgroundTask({
      env: { ZILOBASE_CELL_ID: "cell-a" },
      kind: "automation.run",
      resourceId: "run-1",
    }));

    expect(task.traceparent).toBe("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
    expect(task.tracestate).toBe("vendor=value");
    expect(parseBackgroundTask({ ...task, traceparent: "invalid" }, "cell-a")).toEqual({
      errorCode: "BACKGROUND_TASK_TRACE_INVALID",
      ok: false,
    });
  });
});
