import { createMessageBatch, createExecutionContext, getQueueResult } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createBackgroundWorker } from "../../../src/worker/background-worker";
import { backgroundFixture } from "./server-adapter-api";
import {
  BACKGROUND_TASK_KINDS,
  createBackgroundTaskV2,
} from "../../../../../apps/server/src/infrastructure/background/task-v2";
import { backgroundTaskLane } from "../../../../../apps/server/src/infrastructure/background/contracts";
const queues = {
  fast: "zilobase-background-fast",
  ai: "zilobase-ai-jobs",
  automation: "zilobase-automation-runs",
  calendar: "zilobase-calendar-jobs",
};
const worker = createBackgroundWorker();
const env = { ZILOBASE_CELL_ID: "fixture" };
async function deliver(body: unknown, queue = "zilobase-ai-jobs") {
  const batch = createMessageBatch(queue, [
    { id: "message", timestamp: new Date(), attempts: 1, body },
  ]);
  await worker.queue(batch, env);
  return getQueueResult(batch, createExecutionContext());
}
beforeEach(() => {
  backgroundFixture.completed.clear();
  backgroundFixture.rescheduled.length = 0;
  backgroundFixture.exhausted.length = 0;
  backgroundFixture.executed.length = 0;
});
describe("Miniflare shared queue consumption", () => {
  it.each(BACKGROUND_TASK_KINDS)("acknowledges %s once", async (kind) => {
    const task = createBackgroundTaskV2({ env, kind, resourceId: kind });
    await deliver(task, queues[backgroundTaskLane(kind)]);
    await deliver(task, queues[backgroundTaskLane(kind)]);
    expect(backgroundFixture.executed).toEqual([kind]);
  });
  it("acknowledges a persisted business retry", async () => {
    const result = await deliver(
      createBackgroundTaskV2({ env, kind: "ai.job", resourceId: "business-retry" }),
    );
    expect(backgroundFixture.rescheduled).toHaveLength(1);
    expect(result.retryMessages).toHaveLength(0);
  });
  it("leaves unexpected failure to transport retry", async () => {
    const result = await deliver(
      createBackgroundTaskV2({ env, kind: "ai.job", resourceId: "throw" }),
    );
    expect(result.retryMessages).toHaveLength(1);
    expect(backgroundFixture.completed.size).toBe(0);
  });
  it("records DLQ exhaustion without invoking the feature", async () => {
    const task = createBackgroundTaskV2({ env, kind: "ai.job", resourceId: "failed" });
    const result = await deliver(task, "zilobase-ai-jobs-dlq");
    expect(backgroundFixture.exhausted).toEqual([task.taskId]);
    expect(backgroundFixture.executed).toEqual([]);
    expect(result.retryMessages).toHaveLength(0);
  });
  it("rejects foreign cells and wrong lanes before execution", async () => {
    const task = createBackgroundTaskV2({ env, kind: "ai.job", resourceId: "foreign" });
    await deliver({ ...task, cellId: "other" });
    await deliver(task, "zilobase-background-fast");
    expect(backgroundFixture.executed).toEqual([]);
  });
});
