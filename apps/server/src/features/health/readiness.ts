import { sql } from "drizzle-orm";

import type { RuntimeEnv } from "../../config";
import { db, runWithDbEnv } from "../../db";
import { createImageStorage } from "../../image-storage";
import { isRealtimeReady } from "../../realtime-readiness";

export type ReadinessResult = {
  checks: {
    database: "ok" | "unavailable";
    objectStorage: "ok" | "unavailable";
    realtime: "ok" | "unavailable";
  };
  ok: boolean;
  service: "zilobase-server";
};

type ReadinessDependencies = {
  checkDatabase(env: RuntimeEnv): Promise<void>;
  checkObjectStorage(env: RuntimeEnv): Promise<void>;
};

const defaultReadinessDependencies: ReadinessDependencies = {
  checkDatabase(env) {
    return runWithDbEnv(env, async () => {
      await db.execute(sql`select 1`);
    });
  },
  async checkObjectStorage(env) {
    const storage = createImageStorage(env);

    if (storage.checkReady) {
      await storage.checkReady();
      return;
    }

    await storage.head("__zilobase_readiness__");
  },
};

export async function checkReadiness(
  env: RuntimeEnv,
  dependencies: ReadinessDependencies = defaultReadinessDependencies,
): Promise<ReadinessResult> {
  const [database, objectStorage] = await Promise.allSettled([
    dependencies.checkDatabase(env),
    dependencies.checkObjectStorage(env),
  ]);
  const checks: ReadinessResult["checks"] = {
    database: database.status === "fulfilled" ? "ok" : "unavailable",
    objectStorage:
      objectStorage.status === "fulfilled" ? "ok" : "unavailable",
    realtime: isRealtimeReady(env) ? "ok" : "unavailable",
  };

  return {
    checks,
    ok: Object.values(checks).every((check) => check === "ok"),
    service: "zilobase-server",
  };
}
