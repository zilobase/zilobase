import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { eq } from "drizzle-orm";
import { createDbClient, runWithDbEnv, db } from "../infrastructure/database";
import { createBackgroundTaskV2 } from "../infrastructure/background/task-v2";
import { persistBackgroundTasks } from "../infrastructure/background/publication";
import * as tables from "../infrastructure/database/schema";
const url = process.env.ZILOBASE_BACKGROUND_VERIFY_URL!;
assert.equal(new URL(url).hostname, "127.0.0.1");
const env = {
  DATABASE_URL: url,
  ZILOBASE_CELL_ID: "worker-sql",
  AI_CUSTOM_AGENTS_ENABLED: "false",
};
const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
const directory = await mkdtemp(`${tmpdir()}/zilobase-worker-queue-`);
let worker: InstanceType<typeof Miniflare>;
async function deliver(
  body: ReturnType<typeof createBackgroundTaskV2>,
  queue = "zilobase-ai-jobs",
) {
  const producer = await worker.getQueueProducer(queue);
  await producer.send(body);
  const end = Date.now() + 20_000;
  while (true) {
    const done = await runWithDbEnv(env, async () => {
      const [row] = await db
        .select()
        .from(tables.backgroundDispatch)
        .where(eq(tables.backgroundDispatch.id, body.taskId));
      return (
        row &&
        (["completed", "terminal"].includes(row.status) ||
          (row.status === "exhausted" && !!row.failureHandledAt))
      );
    });
    if (done) return;
    if (Date.now() > end) throw new Error("Worker queue delivery timed out");
    await sleep(100);
  }
}
try {
  await promisify(execFile)(
    fileURLToPath(new URL("../../../../node_modules/.bin/wrangler", import.meta.url)),
    [
      "deploy",
      "--dry-run",
      "--config",
      "scripts/background/worker-fixture.jsonc",
      "--outdir",
      directory,
    ],
    { cwd: fileURLToPath(new URL("../../../../", import.meta.url)), maxBuffer: 1024 * 1024 },
  );
  const names = [
    "zilobase-background-fast",
    "zilobase-automation-runs",
    "zilobase-ai-jobs",
    "zilobase-calendar-jobs",
  ];
  const all = [...names, ...names.map((name) => name + "-dlq")];
  worker = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "fixture",
          modules: true,
          script: await readFile(`${directory}/worker-fixture.js`, "utf8"),
          compatibilityDate: "2026-08-21",
          compatibilityFlags: ["nodejs_compat"],
          bindings: { ...env, ZILOBASE_RUNTIME_KIND: "worker" },
          queueProducers: {
            ...Object.fromEntries(all.map((name) => [name, name])),
            BACKGROUND_FAST: names[0],
            AUTOMATION_RUNS: names[1],
            AI_JOBS: names[2],
            CALENDAR_JOBS: names[3],
          },
          queueConsumers: Object.fromEntries(
            all.map((name) => [
              name,
              {
                maxBatchSize: 10,
                maxBatchTimeout: 1,
                maxRetries: name.includes("automation") || name.includes("calendar") ? 8 : 5,
              },
            ]),
          ),
        },
      ],
    }),
  );
  assert.equal(new URL(url).pathname, "/zilobase_background_verify");
  await runWithDbEnv(env, async () => {
    await db
      .insert(tables.user)
      .values({ id: "worker-owner", name: "Worker", email: "worker@fixture.invalid" });
    await db
      .insert(tables.workspace)
      .values({ id: "worker-workspace", name: "Worker", slug: "worker-workspace" });
    await db
      .insert(tables.aiChatThread)
      .values({ id: "worker-thread", userId: "worker-owner", workspaceId: "worker-workspace" });
    await db.insert(tables.aiJob).values({
      id: "worker-job",
      workspaceId: "worker-workspace",
      userId: "worker-owner",
      type: "thread-compaction",
      input: { threadId: "worker-thread" },
      dedupeKey: "worker-job",
      availableAt: new Date(),
    });
  });
  const task = createBackgroundTaskV2({ env, kind: "ai.job", resourceId: "worker-job" });
  await runWithDbEnv(env, () => persistBackgroundTasks(env, [task]));
  await deliver(task);
  await deliver(task);
  await runWithDbEnv(env, async () => {
    const [job] = await db.select().from(tables.aiJob).where(eq(tables.aiJob.id, "worker-job"));
    assert.equal(job.status, "succeeded");
    assert.equal(job.attempt, 1);
    assert.equal(
      (
        await db
          .select()
          .from(tables.backgroundDispatch)
          .where(eq(tables.backgroundDispatch.id, task.taskId))
      )[0].status,
      "completed",
    );
  });
  const retry = createBackgroundTaskV2({ env, kind: "agent.run", resourceId: "disabled-agent" });
  await runWithDbEnv(env, () => persistBackgroundTasks(env, [retry]));
  await deliver(retry, "zilobase-automation-runs");
  await runWithDbEnv(env, async () => {
    const rows = await db
      .select()
      .from(tables.backgroundDispatch)
      .where(eq(tables.backgroundDispatch.resourceId, "disabled-agent"));
    assert.equal(rows.length, 2);
    assert.equal(rows.find((row) => row.id === retry.taskId)?.status, "completed");
  });
  const dlq = createBackgroundTaskV2({ env, kind: "ai.job", resourceId: "worker-failed-job" });
  await runWithDbEnv(env, async () => {
    await db.insert(tables.aiJob).values({
      id: "worker-failed-job",
      workspaceId: "worker-workspace",
      type: "fixture",
      input: {},
      dedupeKey: "worker-failed-job",
      availableAt: new Date(),
    });
    await persistBackgroundTasks(env, [dlq]);
  });
  await deliver(dlq, "zilobase-ai-jobs-dlq");
  await runWithDbEnv(env, async () => {
    assert.equal(
      (
        await db
          .select()
          .from(tables.backgroundDispatch)
          .where(eq(tables.backgroundDispatch.id, dlq.taskId))
      )[0].status,
      "exhausted",
    );
    assert.equal(
      (await db.select().from(tables.aiJob).where(eq(tables.aiJob.id, "worker-failed-job")))[0]
        .status,
      "failed",
    );
  });
  console.info(
    "Miniflare real queue/SQL verification passed: production admission, duplicate AI delivery, business rescheduling and DLQ feature finalization.",
  );
} finally {
  await worker?.dispose();
  await createDbClient(env).client.end();
  await rm(directory, { recursive: true, force: true });
}
