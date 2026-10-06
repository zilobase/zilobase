import { describe, expect, it } from "vitest";
import { getQueueRedisUrl, NODE_BACKGROUND_QUEUE_NAMES } from "./queue-runtime";
import { createNodeJobs } from "./jobs";

describe("dedicated Node queues", () => {
  it("requires dedicated queue Redis even when realtime Redis is configured", () => {
    expect(() => getQueueRedisUrl({ REALTIME_REDIS_URL: "redis://localhost:6379" })).toThrow(
      "QUEUE_REDIS_URL",
    );
    expect(() => getQueueRedisUrl({ QUEUE_REDIS_URL: "https://localhost" })).toThrow();
    expect(() =>
      getQueueRedisUrl({
        QUEUE_REDIS_URL: "redis://localhost:6379/1",
        REALTIME_REDIS_URL: "redis://localhost:6379/0",
      }),
    ).toThrow();
    expect(
      getQueueRedisUrl({
        QUEUE_REDIS_URL: "redis://localhost:6380",
        REALTIME_REDIS_URL: "redis://localhost:6379",
      }),
    ).toBe("redis://localhost:6380");
  });
  it("defines four independent lane queues", () => {
    expect(NODE_BACKGROUND_QUEUE_NAMES).toEqual({
      fast: "background-fast",
      automation: "automation-runs",
      ai: "ai-jobs",
      calendar: "calendar-jobs",
    });
  });
  it("rejects dispatch after the queue runtime is detached", async () => {
    await expect(createNodeJobs(() => null).dispatch([])).rejects.toThrow(
      "BACKGROUND_QUEUE_NOT_STARTED",
    );
  });
});
