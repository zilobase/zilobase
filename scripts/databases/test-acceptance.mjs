#!/usr/bin/env node

import { spawn } from "node:child_process"
import { access } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
)
const full = process.argv.includes("--full")
const cloudflareAdapterRoot = path.resolve(
  process.env.ZILOBASE_CLOUDFLARE_ADAPTER_DIR ||
    path.join(repositoryRoot, "..", "zilobase-cloudflare-adapter"),
)

if (full) {
  for (const name of ["ZILOBASE_PREVIOUS_IMAGE", "ZILOBASE_CURRENT_IMAGE"]) {
    if (!process.env[name]) throw new Error(`${name} is required for --full`)
  }
  await access(path.join(cloudflareAdapterRoot, "package.json"))
}

await run("npm", ["run", "test:databases", "--workspace", "@zilobase/features"])
await run("npx", [
  "tsx",
  "--test",
  "src/databases/client/bootstrap-collections.test.ts",
  "src/databases/client/command-lanes.test.ts",
  "src/databases/client/database-client.test.ts",
  "src/databases/client/ingestion.test.ts",
  "src/databases/client/record-collections.test.ts",
], { cwd: path.join(repositoryRoot, "packages", "features") })
await run("npx", [
  "vitest",
  "run",
  "src/features/databases/database-v2-acceptance.test.ts",
  "src/features/databases/database-v2-persistence.test.ts",
  "src/features/databases/commands/framework.test.ts",
  "src/features/databases/commands/row-handlers.test.ts",
  "src/features/databases/core/position-service.test.ts",
  "src/features/databases/read/service.test.ts",
  "src/features/databases/database-read-routes.test.ts",
  "src/features/databases/history/service.test.ts",
  "src/features/databases/realtime/outbox.test.ts",
  "src/app/node/database-realtime-runtime.test.ts",
  "src/app/node/node-runtime.test.ts",
], { cwd: path.join(repositoryRoot, "apps", "server") })
await run("npm", ["test", "--workspace", "@zilobase/web"], {
  env: {
    ...process.env,
    ZILOBASE_WEB_TEST_PATTERN: "features/databases/",
  },
})
await run("npm", ["run", "build", "--workspace", "@zilobase/server"])
await run("npm", ["run", "build", "--workspace", "@zilobase/web"])

if (full) {
  await run("npm", ["run", "test:selfhost:upgrade"])
  await run("npm", ["run", "build"], { cwd: cloudflareAdapterRoot })
  await run("npm", ["test"], { cwd: cloudflareAdapterRoot })
  await run("npm", ["run", "deploy:check"], { cwd: cloudflareAdapterRoot })
} else {
  console.info(
    "Database acceptance passed. Use --full with release images and Cloudflare " +
      "production configuration to add upgrade and deployment checks.",
  )
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repositoryRoot,
      env: options.env ?? process.env,
      stdio: "inherit",
    })
    child.once("error", reject)
    child.once("exit", (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with ${signal || code}`))
    })
  })
}
