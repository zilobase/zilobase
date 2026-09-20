import type { Lifecycle } from "@zilobase/runtime-ports";

export function createWorkerLifecycle(): Lifecycle {
  return {
    async migrate() {},
    async start() {},
    async close() {},
  };
}
