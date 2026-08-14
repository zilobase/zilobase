import { config as loadEnv } from "dotenv";
import path from "node:path";

import { createApp } from "../../app";
import { createNodeRuntime } from "./node-runtime";
import { CORE_MIGRATION_SET } from "./migrations";

loadEnv({
  path: process.env.ZILOBASE_ENV_FILE ?? path.resolve("apps/server/.env"),
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
    process.exit(0);
  });
}

void runtime.start().catch((error) => {
  console.error("Unable to start Zilobase server", error);
  process.exit(1);
});
