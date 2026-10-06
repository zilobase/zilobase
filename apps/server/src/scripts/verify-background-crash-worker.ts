/** Child fixture killed after a production handler enters fanout. */
import assert from "node:assert/strict";
import { createNodeQueueRuntime } from "@zilobase/runtime-adapter/node";
import { runWithRuntimePorts } from "@zilobase/runtime-adapter/capabilities";
import { runWithDbEnv } from "../infrastructure/database";
import {
  BACKGROUND_LANE_POLICY,
  decodeBackgroundTaskV2,
} from "../infrastructure/background/task-v2";
import { backgroundTaskLane } from "../infrastructure/background/contracts";
import {
  deliverBackgroundTask,
  recordBackgroundExhaustion,
} from "../app/background/runtime-delivery";
import { publishBackgroundDispatches } from "../infrastructure/background/publication";
const env = process.env;
assert.equal(new URL(env.DATABASE_URL!).pathname, "/zilobase_background_verify");
assert.equal(new URL(env.QUEUE_REDIS_URL!).hostname, "127.0.0.1");
const cell = env.ZILOBASE_CELL_ID!;
let runtime: ReturnType<typeof createNodeQueueRuntime>;
const scoped = <T>(work: () => Promise<T>) =>
  runWithRuntimePorts(
    {
      jobs: { dispatch: (tasks) => runtime.dispatch(tasks) },
      fanout: {
        subscribe: async () => () => {},
        publish: async () => {
          process.send?.({ event: "handler-entered" });
          await new Promise<void>(() => {});
        },
      },
    },
    () => runWithDbEnv(env, work),
  );
runtime = createNodeQueueRuntime(env, {
  validate: (body) => decodeBackgroundTaskV2(body, cell),
  lane: (task) => backgroundTaskLane(task.kind as never),
  policy: BACKGROUND_LANE_POLICY,
  deliver: (body, lane, owner) => scoped(() => deliverBackgroundTask(env, body, lane, owner)),
  exhausted: (body, lane) => scoped(() => recordBackgroundExhaustion(env, body, lane)),
  maintain: () => scoped(() => publishBackgroundDispatches(env)),
});
await runtime.start();
