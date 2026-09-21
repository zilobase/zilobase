// Node process entrypoint for self-hosted and serverful deployments.
import { config as loadEnv } from "@dotenvx/dotenvx";
import path from "node:path";

import { startNodeServer } from "@zilobase/runtime-adapter/node";
import {
  CORE_MIGRATION_SET,
  assertSelfHostedProductionConfiguration,
  createApp,
  getAppEditionExtension,
  DATABASE_REALTIME_PROTOCOL,
} from "@zilobase/server/node-adapter-api";
import { startNodeTelemetry } from "../infrastructure/background/node-telemetry";
import { shutdownNodeTelemetry } from "../infrastructure/background/node-telemetry";
import { disposeProcessRuntimes } from "../infrastructure/effect";

const CORE_SCHEMA_TARGET = "0092_database_v2_constraints";

async function main() {
  startNodeTelemetry();
  loadEnv({
    path: process.env.ZILOBASE_ENV_FILE ?? path.resolve("apps/server/.env"),
    quiet: true,
    ignore: ["MISSING_ENV_FILE"],
    noOps: true,
  });

  const runtime = await startNodeServer({
    loadApp: async (_env, ports) => createApp({ ports }),
    migrationSets: [CORE_MIGRATION_SET],
    webDistDir:
      process.env.ZILOBASE_WEB_DIST_DIR ?? path.resolve("apps/web/dist"),
    hooks: {
      getEditionExtension: (app) => getAppEditionExtension(app),
      assertProductionConfig: (env) => assertSelfHostedProductionConfiguration(env),
    },
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, async () => {
      await runtime.close();
      await disposeProcessRuntimes();
      await shutdownNodeTelemetry();
      process.exit(0);
    });
  }

  console.info(JSON.stringify({
    autoMigrate: process.env.ZILOBASE_AUTO_MIGRATE === "true",
    event: "runtime.startup",
    migrationSets: runtime.migrationSets.map((migrationSet) => migrationSet.id),
    protocol: DATABASE_REALTIME_PROTOCOL,
    schemaTarget: CORE_SCHEMA_TARGET,
  }));
}

void main().catch(async (error) => {
  console.error("Failed to start the Zilobase server", error);
  await disposeProcessRuntimes();
  await shutdownNodeTelemetry();
  process.exitCode = 1;
});
