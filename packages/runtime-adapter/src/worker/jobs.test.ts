import { describe, expect, it, vi } from "vitest";
import { createWorkerJobs } from "./jobs";

describe("worker Jobs port", () => {
  it("routes tasks by lane and applies queue delay", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const send = vi.fn(async () => undefined);
    const jobs = createWorkerJobs({ AI_JOBS: { send } });

    await jobs.dispatch([{
      availableAt: "2026-01-01T00:00:10.000Z",
      cellId: "default",
      kind: "ai.job",
      resourceId: "job-1",
      version: 1,
    }]);

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ resourceId: "job-1" }), { delaySeconds: 10 });
    vi.useRealTimers();
  });
});
