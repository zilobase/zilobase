import { sql } from "drizzle-orm";
import { Context, Effect, Layer, ManagedRuntime } from "effect";

import type { RuntimeEnv } from "../../shared/config/config";
import { db } from "../../infrastructure/database";
import { Db } from "../../infrastructure/database/db";
import { appMemoMap, createAppRuntime } from "../../infrastructure/effect";
import { ObjectStorage } from "../../infrastructure/storage/object-storage";
import { requireRuntimePort } from "@zilobase/runtime-adapter/capabilities";

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

export class ReadinessChecks extends Context.Service<
  ReadinessChecks,
  {
    checkDatabase(env: RuntimeEnv): Effect.Effect<void, unknown>;
    checkObjectStorage(env: RuntimeEnv): Effect.Effect<void, unknown>;
  }
>()("@zilobase/server/features/health/ReadinessChecks") {
  static readonly layerNoDeps = Layer.effect(
    this,
    Effect.gen(function* () {
      const database = yield* Db;
      const objectStorage = yield* ObjectStorage;

      return ReadinessChecks.of({
        checkDatabase: (env) =>
          database.withEnv(env, async () => {
            await db.execute(sql`select 1`);
          }),
        checkObjectStorage: (env) => objectStorage.checkReady(env),
      });
    }),
  );

  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(Db.layer),
    Layer.provide(ObjectStorage.layer),
  );
}

export const evaluateReadiness = Effect.fn("evaluateReadiness")(
  function* (env: RuntimeEnv) {
    const dependencies = yield* ReadinessChecks;
    const [database, objectStorage] = yield* Effect.all(
      [
        dependencies.checkDatabase(env).pipe(
          Effect.as("ok" as const),
          Effect.orElseSucceed(() => "unavailable" as const),
        ),
        dependencies.checkObjectStorage(env).pipe(
          Effect.as("ok" as const),
          Effect.orElseSucceed(() => "unavailable" as const),
        ),
      ],
      { concurrency: "unbounded" },
    );
    const readiness = requireRuntimePort("readiness");
    const checks: ReadinessResult["checks"] = {
      database,
      objectStorage,
      realtime: readiness.realtime() ? "ok" : "unavailable",
    };
    if (readiness.background().coordinatorReady === false) {
      checks.background = "unavailable";
    }

    return {
      checks,
      ok: Object.values(checks).every((check) => check === "ok"),
      service: "zilobase-server",
    } satisfies ReadinessResult;
  },
);

export const readinessRuntime = createAppRuntime(ReadinessChecks.layer, {
  process: true,
});

export async function checkReadiness(
  env: RuntimeEnv,
  dependencies?: ReadinessDependencies,
): Promise<ReadinessResult> {
  if (!dependencies) {
    return readinessRuntime.runPromise(evaluateReadiness(env));
  }

  const runtime = ManagedRuntime.make(readinessChecksLayerFrom(dependencies), {
    memoMap: appMemoMap,
  });
  try {
    return await runtime.runPromise(evaluateReadiness(env));
  } finally {
    await runtime.dispose();
  }
}

function readinessChecksLayerFrom(dependencies: ReadinessDependencies) {
  return Layer.succeed(ReadinessChecks, {
    checkDatabase: promiseCheck(dependencies.checkDatabase),
    checkObjectStorage: promiseCheck(dependencies.checkObjectStorage),
  });
}

function promiseCheck(run: (env: RuntimeEnv) => Promise<void>) {
  return (env: RuntimeEnv) =>
    Effect.tryPromise({
      try: () => run(env),
      catch: (cause) => cause,
    });
}
