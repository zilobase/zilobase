import { sql } from "drizzle-orm";

import { requireRuntimePort } from "@zilobase/runtime-adapter/capabilities";
import { db, runWithDbEnv } from "../../infrastructure/database";
import { createImageStorage } from "../../infrastructure/storage/image-storage";
import type { RuntimeEnv } from "../../shared/config/config";

export type ReadinessResult = {
  checks: {
    database: "ok" | "unavailable";
    objectStorage: "ok" | "unavailable";
    realtime: "ok" | "unavailable";
    background?: "unavailable";
  };
  ok: boolean;
  service: "zilobase-server";
};

type ReadinessDependencies = {
  checkDatabase(env: RuntimeEnv): Promise<void>;
  checkObjectStorage(env: RuntimeEnv): Promise<void>;
};

const defaultReadinessDependencies: ReadinessDependencies = {
  checkDatabase: (env) =>
    runWithDbEnv(env, async () => {
      await db.execute(sql`select 1`);
    }),
  checkObjectStorage: (env) => createImageStorage(env).checkReady(),
};

export async function checkReadiness(
  env: RuntimeEnv,
  dependencies: ReadinessDependencies = defaultReadinessDependencies,
): Promise<ReadinessResult> {
  const [database, objectStorage] = await Promise.all([
    probe(() => dependencies.checkDatabase(env)),
    probe(() => dependencies.checkObjectStorage(env)),
  ]);
  const readiness = requireRuntimePort("readiness");
  const checks: ReadinessResult["checks"] = {
    database,
    objectStorage,
    realtime: readiness.realtime() ? "ok" : "unavailable",
  };
  const queue = readiness.background();
  if (
    queue.producerReady === false ||
    queue.consumerReady === false ||
    queue.maintenanceFresh === false
  ) {
    checks.background = "unavailable";
  }

  return {
    checks,
    ok: Object.values(checks).every((check) => check === "ok"),
    service: "zilobase-server",
  };
}

async function probe(check: () => Promise<void>) {
  try {
    await check();
    return "ok" as const;
  } catch {
    return "unavailable" as const;
  }
}
