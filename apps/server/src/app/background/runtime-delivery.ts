import { runWithIndependentDbEnv } from "../../infrastructure/database";
import { createBackgroundDeliveryStore } from "../../infrastructure/background/publication";
import {
  getBackgroundCellId,
  type BackgroundLane,
} from "../../infrastructure/background/contracts";
import { processBackgroundTask } from "./processor";
import { runBackgroundDelivery } from "./delivery";
import type { RuntimeEnv } from "../../shared/config/config";

/** Both runtime composition roots enter through this durable delivery boundary. */
export async function deliverBackgroundTask(
  env: RuntimeEnv,
  body: unknown,
  lane: BackgroundLane,
  workerId: string,
) {
  const store = createBackgroundDeliveryStore(env, workerId);
  return runBackgroundDelivery({
    body,
    lane,
    cellId: getBackgroundCellId(env),
    store,
    execute: async (task) => {
      let renewal: Promise<unknown> | undefined;
      let lost = false;
      const heartbeat = setInterval(() => {
        if (renewal) return;
        renewal = runWithIndependentDbEnv(env, () => store.renew(task))
          .catch(() => {
            lost = true;
          })
          .finally(() => {
            renewal = undefined;
          });
      }, 30_000);
      try {
        const result = await processBackgroundTask({ env, task, workerId });
        await renewal;
        if (lost) throw new Error("BACKGROUND_DELIVERY_LEASE_LOST");
        return result;
      } finally {
        clearInterval(heartbeat);
      }
    },
  });
}

export { recordBackgroundExhaustion, reconcileBackgroundFailures } from "./failures";
