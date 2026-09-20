import type { Limits } from "@zilobase/runtime-ports";

type WorkerRateLimiter = {
  limit(input: { key: string }): Promise<{ success: boolean }>;
};

export type WorkerLimitsEnv = {
  COLLABORATION_RATE_LIMITER?: WorkerRateLimiter;
};

export function createWorkerLimits(env: WorkerLimitsEnv): Limits {
  return {
    async consume(key) {
      const limiter = env.COLLABORATION_RATE_LIMITER;
      if (!limiter) throw new Error("COLLABORATION_RATE_LIMITER binding is required");
      return (await limiter.limit({ key })).success;
    },
  };
}
