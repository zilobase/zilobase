import { config as loadEnv } from "@dotenvx/dotenvx";
import path from "node:path";

import { createApp } from "../../app";
import { createNodeRuntime } from "./node-runtime";
import { CORE_MIGRATION_SET } from "../../infrastructure/node/migrations";
import { shutdownNodeTelemetry } from "../../infrastructure/background/node-telemetry";
import { disposeProcessRuntimes } from "../../infrastructure/effect";
import { DATA_SOURCE_REALTIME_PROTOCOL } from "../../shared/security/database-realtime-ticket";

const CORE_SCHEMA_TARGET = "0093_source_realtime_stream";

loadEnv({
  path: process.env.ZILOBASE_ENV_FILE ?? path.resolve("apps/server/.env"),
  quiet: true,
  ignore: ["MISSING_ENV_FILE"],
  noOps: true,
});

const runtime = createNodeRuntime({
  app: createApp(),
  migrationSets: [CORE_MIGRATION_SET],
  runtimeAdapter: {},
  webDistDir:
    process.env.ZILOBASE_WEB_DIST_DIR ?? path.resolve("apps/web/dist"),
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await runtime.close();
    await disposeProcessRuntimes();
    await shutdownNodeTelemetry();
    process.exit(0);
  });
}

async function start() {
  const autoMigrate = process.env.ZILOBASE_AUTO_MIGRATE === "true";
  if (autoMigrate) await runtime.migrate();
  console.info(JSON.stringify({
    autoMigrate,
    event: "runtime.startup",
    migrationSets: runtime.migrationSets.map((migrationSet) => migrationSet.id),
    protocol: DATA_SOURCE_REALTIME_PROTOCOL,
    schemaTarget: CORE_SCHEMA_TARGET,
  }));
  await runtime.start();
}

void start().catch(async (error) => {
  console.error("Unable to start Zilobase server", error);
  await disposeProcessRuntimes();
  await shutdownNodeTelemetry();
  process.exit(1);
});
