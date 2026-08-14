import { sql } from "drizzle-orm";

import type { RuntimeEnv } from "../../config";
import { db, runWithDbEnv } from "../../db";
import { createImageStorage } from "../../image-storage";

export type ReadinessResult = {
  checks: {
    database: "ok" | "unavailable";
    objectStorage: "ok" | "unavailable";
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
  };

  return {
    checks,
    ok: checks.database === "ok" && checks.objectStorage === "ok",
    service: "zilobase-server",
  };
}
