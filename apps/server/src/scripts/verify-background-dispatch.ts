import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { runMigrationSets } from "@zilobase/runtime-adapter/node";
import { runWithRuntimePorts } from "@zilobase/runtime-adapter/capabilities";
import { createDbClientForUrl, runWithDb } from "../infrastructure/database";
import { CORE_MIGRATION_SET } from "../public/node-adapter-api";
import { backgroundDispatch, workspace, aiJob } from "../infrastructure/database/schema";
import { createBackgroundTask } from "../infrastructure/background/contracts";
import {
  backgroundTransaction,
  persistBackgroundTasks,
  publishBackgroundDispatches,
  createBackgroundDeliveryStore,
} from "../infrastructure/background/publication";
import { enqueueAiJob } from "../features/ai/jobs/ai-jobs";
import { runBackgroundDelivery } from "../app/background/delivery";

const connection = process.env.ZILOBASE_BACKGROUND_VERIFY_URL;
assert.ok(connection, "Use the isolated background runner");
const url = new URL(connection);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/zilobase_background_verify");
const first = createDbClientForUrl(connection);
const second = createDbClientForUrl(connection);
const env = { ZILOBASE_CELL_ID: "verification", DATABASE_URL: connection };
const sent: string[] = [];
let brokerDown = true;
const ports = {
  jobs: {
    async dispatch(tasks: readonly { taskId: string }[]) {
      if (brokerDown) throw new Error("broker unavailable");
      sent.push(...tasks.map((task) => task.taskId));
    },
    async drain() {},
  },
};
try {
  await first.client.connect();
  await second.client.connect();
  const tables = await first.client.query(
    "select count(*)::int as count from information_schema.tables where table_schema='public'",
  );
  assert.equal(tables.rows[0].count, 0, "Fixture refuses nonempty database");
  await runMigrationSets(first.db, [CORE_MIGRATION_SET]);
  await runWithRuntimePorts(ports, () =>
    runWithDb(first.db, async () => {
      await assert.rejects(
        backgroundTransaction(env, async (tx) => {
          await tx.insert(workspace).values({ id: "rollback", name: "Rollback", slug: "rollback" });
          await persistBackgroundTasks(env, [
            createBackgroundTask({ env, kind: "ai.job", resourceId: "rollback" }),
          ]);
          throw new Error("rollback fixture");
        }),
      );
    }),
  );
  assert.equal((await first.db.select().from(workspace)).length, 0);
  assert.equal((await first.db.select().from(backgroundDispatch)).length, 0);
  await first.db.insert(workspace).values({ id: "workspace", name: "Fixture", slug: "fixture" });
  await runWithRuntimePorts(ports, () =>
    runWithDb(first.db, async () => {
      const job = await enqueueAiJob({
        env,
        workspaceId: "workspace",
        type: "fixture",
        input: {},
        dedupeKey: "once",
      });
      assert.equal((await first.db.select().from(aiJob)).length, 1);
      const [dispatch] = await first.db.select().from(backgroundDispatch);
      assert.equal(dispatch.resourceId, job.id);
      assert.equal(dispatch.status, "pending");
      await first.db.update(backgroundDispatch).set({ nextPublicationAt: new Date(0) });
      brokerDown = false;
      await Promise.all([
        publishBackgroundDispatches(env),
        runWithDb(second.db, () => publishBackgroundDispatches(env)),
      ]);
      assert.deepEqual(sent, [dispatch.id], "Competing publishers converge");
      let effects = 0;
      const store = createBackgroundDeliveryStore(env, "fixture-worker");
      const delivery = () =>
        runBackgroundDelivery({
          body: dispatch.task,
          cellId: env.ZILOBASE_CELL_ID,
          lane: "ai",
          store,
          execute: async () => {
            effects++;
            return { outcome: "completed" };
          },
        });
      await delivery();
      await delivery();
      assert.equal(effects, 1);
      await first.db.update(backgroundDispatch).set({ nextPublicationAt: new Date(0) });
      await publishBackgroundDispatches(env);
      assert.equal(sent.length, 1, "Completed work never republishes");
      const task = createBackgroundTask({ env, kind: "notification.publish", resourceId: "retry" });
      await persistBackgroundTasks(env, [task]);
      await runBackgroundDelivery({
        body: task,
        cellId: env.ZILOBASE_CELL_ID,
        lane: "fast",
        store,
        execute: async () => ({
          outcome: "retry",
          availableAt: new Date(Date.now() + 1000).toISOString(),
        }),
      });
      const rows = await first.db.select().from(backgroundDispatch);
      assert.equal(
        rows.filter((row) => row.resourceId === "retry").length,
        2,
        "Business retry is a new occurrence",
      );
      assert.equal(rows.find((row) => row.id === task.taskId)?.status, "completed");
    }),
  );
  console.info(
    "Background PostgreSQL verification passed: migrations, rollback, commit/enqueue failure, competing publication, duplicates, completion and business retries.",
  );
} finally {
  await first.client.end();
  await second.client.end();
}
