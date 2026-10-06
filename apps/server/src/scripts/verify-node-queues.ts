import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Redis from "ioredis";
import { createNodeQueueRuntime, purgeNodeCellQueues } from "@zilobase/runtime-adapter/node";
import {
  BACKGROUND_LANE_POLICY,
  createBackgroundTaskV2,
  decodeBackgroundTaskV2,
  BACKGROUND_TASK_KINDS,
} from "../infrastructure/background/task-v2";
import { backgroundTaskLane } from "../infrastructure/background/contracts";

const url = process.env.ZILOBASE_QUEUE_VERIFY_URL;
assert.ok(url && new URL(url).hostname === "127.0.0.1", "Disposable queue Redis is required");
const cell = crypto.randomUUID();
const env = { QUEUE_REDIS_URL: url, ZILOBASE_CELL_ID: cell };
const effects: string[] = [];
const exhausted: string[] = [];
const attempts = new Map<string, number>();
let hold: (() => void) | undefined;
const callbacks = {
  validate: (body: unknown) => decodeBackgroundTaskV2(body, cell),
  lane: (task: { kind: string }) => backgroundTaskLane(task.kind as never),
  policy: BACKGROUND_LANE_POLICY,
  maintain: async () => {},
  exhausted: async (body: unknown) => {
    exhausted.push(decodeBackgroundTaskV2(body, cell).resourceId);
  },
  deliver: async (body: unknown) => {
    const task = decodeBackgroundTaskV2(body, cell);
    attempts.set(task.resourceId, (attempts.get(task.resourceId) ?? 0) + 1);
    if (task.resourceId === "held")
      await new Promise<void>((resolve) => {
        hold = resolve;
      });
    if (task.resourceId === "business" && attempts.get(task.resourceId)! <= 7)
      return { outcome: "defer" as const, availableAt: new Date().toISOString() };
    if (task.resourceId === "unexpected") throw new Error("fixture transport failure");
    if (Date.parse(task.availableAt) > Date.now())
      return { outcome: "defer" as const, availableAt: task.availableAt };
    effects.push(task.resourceId);
    return { outcome: "ack" as const };
  },
};
async function until(check: () => boolean | Promise<boolean>, timeout = 60_000) {
  const end = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > end) throw new Error("Queue fixture timed out");
    await sleep(50);
  }
}
const producer = createNodeQueueRuntime({ ...env, ZILOBASE_PROCESS_ROLE: "api" }, callbacks);
const worker = createNodeQueueRuntime({ ...env, ZILOBASE_PROCESS_ROLE: "worker" }, callbacks);
try {
  await producer.start();
  const tasks = BACKGROUND_TASK_KINDS.map((kind) =>
    createBackgroundTaskV2({ env, kind, resourceId: kind }),
  );
  await producer.dispatch(tasks);
  await producer.dispatch(tasks);
  await sleep(100);
  assert.equal(effects.length, 0, "API role never consumes");
  assert.equal(producer.readiness().consumerReady, null);
  console.info("BullMQ fixture: consumption");
  await worker.start();
  await until(() => effects.length === 7);
  assert.equal(new Set(effects).size, 7, "Stable task IDs deduplicate enqueue");
  console.info("BullMQ fixture: delays");
  const future = createBackgroundTaskV2({
    env,
    kind: "ai.job",
    resourceId: "future",
    availableAt: new Date(Date.now() + 2000),
  });
  await producer.dispatch([future]);
  await sleep(500);
  assert.ok(!effects.includes("future"), "Future work cannot execute early");
  await until(() => effects.includes("future"));
  const job = await producer.queues.get("ai")!.getJob(future.taskId);
  assert.equal(job!.opts.attempts, 6);
  assert.equal(
    job!.opts.removeOnComplete && (job!.opts.removeOnComplete as { age: number }).age,
    86400,
  );
  const business = createBackgroundTaskV2({ env, kind: "ai.job", resourceId: "business" });
  await producer.dispatch([business]);
  await until(() => effects.includes("business"));
  assert.equal(attempts.get("business"), 8, "Business deferral exceeds the transport retry budget");
  assert.equal((await producer.queues.get("ai")!.getJob(business.taskId))!.attemptsMade, 1);
  console.info("BullMQ fixture: transport retries");
  await producer.dispatch([
    createBackgroundTaskV2({ env, kind: "realtime.database", resourceId: "unexpected" }),
  ]);
  await until(() => exhausted.includes("unexpected"));
  assert.equal(attempts.get("unexpected"), 6, "Initial attempt plus five transport redeliveries");
  await producer.dispatch([createBackgroundTaskV2({ env, kind: "ai.job", resourceId: "held" })]);
  await until(() => !!hold);
  const activeBroker = process.env.ZILOBASE_QUEUE_VERIFY_CONTAINER!;
  assert.ok(
    activeBroker.startsWith("zilobase-background-test-") && activeBroker.endsWith("-queue"),
  );
  await promisify(execFile)("docker", ["restart", "--time", "3", activeBroker]);
  await until(
    () => producer.readiness().producerReady === true && worker.readiness().consumerReady === true,
  );
  let stopped = false;
  console.info("BullMQ fixture: shutdown");
  const stop = worker.stop().then(() => {
    stopped = true;
  });
  await sleep(100);
  assert.equal(stopped, false, "Shutdown waits for an active handler");
  hold!();
  await stop;
  console.info("BullMQ fixture: restart");
  const retained = createBackgroundTaskV2({ env, kind: "ai.job", resourceId: "restart" });
  await producer.dispatch([retained]);
  const container = process.env.ZILOBASE_QUEUE_VERIFY_CONTAINER;
  assert.ok(container);
  assert.ok(container.startsWith("zilobase-background-test-") && container.endsWith("-queue"));
  await promisify(execFile)("docker", ["restart", "--time", "3", container]);
  await until(() => producer.readiness().producerReady === true);
  assert.ok(
    await producer.queues.get("ai")!.getJob(retained.taskId),
    "Queue survives broker restart",
  );
  const restarted = createNodeQueueRuntime({ ...env, ZILOBASE_PROCESS_ROLE: "all" }, callbacks);
  try {
    await restarted.start();
    await until(() => effects.includes("restart"));
  } finally {
    await restarted.stop();
  }
  const otherEnv = { ...env, ZILOBASE_CELL_ID: `${cell}-other`, ZILOBASE_PROCESS_ROLE: "api" };
  const other = createNodeQueueRuntime(otherEnv, {
    ...callbacks,
    validate: (body: unknown) => decodeBackgroundTaskV2(body, otherEnv.ZILOBASE_CELL_ID),
  });
  const redis = new Redis(url);
  try {
    await other.start();
    const untouched = createBackgroundTaskV2({
      env: otherEnv,
      kind: "ai.job",
      resourceId: "isolated",
    });
    await other.dispatch([untouched]);
    await redis.set(`unrelated:${cell}`, "retained");
    await purgeNodeCellQueues(env, cell);
    assert.ok(await other.queues.get("ai")!.getJob(untouched.taskId));
    assert.equal(await redis.get(`unrelated:${cell}`), "retained");
    assert.equal(await producer.queues.get("ai")!.getJob(retained.taskId), undefined);
  } finally {
    await other.stop();
    redis.disconnect();
  }
  const unavailable = createNodeQueueRuntime(
    { ...env, QUEUE_REDIS_URL: "redis://127.0.0.1:1", ZILOBASE_PROCESS_ROLE: "api" },
    callbacks,
  );
  const start = Date.now();
  try {
    await unavailable.start();
    assert.equal(unavailable.readiness().producerReady, false);
    await assert.rejects(unavailable.dispatch([retained]), /UNAVAILABLE/);
  } finally {
    await unavailable.stop();
  }
  assert.ok(Date.now() - start < 8000, "Startup and shutdown stay bounded during an outage");
  console.info(
    "BullMQ verification passed: all seven envelopes, split roles, deduplication, delay, retry exhaustion, graceful shutdown and persistent broker restart.",
  );
} finally {
  await producer.stop();
  await worker.stop();
}
