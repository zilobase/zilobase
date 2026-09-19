import path from "node:path";
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readlink,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "@dotenvx/dotenvx";

import { runCommand } from "./lib/run-command.mjs";
import { isFeatureFlagEnabled } from "./lib/feature-flags.mjs";
import { workerStackDevArgs } from "./lib/local-wrangler.mjs";
import {
  requiredBackgroundRuntimeSecretNames,
  requiredRuntimeSecretNames,
} from "./lib/runtime-secrets.mjs";

const adapterDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const localEnvFile = path.join(adapterDir, ".env.development");
const localEnv = {};
loadEnv({
  path: localEnvFile,
  processEnv: localEnv,
  overload: true,
  quiet: true,
  ignore: ["MISSING_ENV_FILE"],
  noOps: true,
});
const stackEnv = {
  ...localEnv,
  ...process.env,
};
const temporaryDir = await mkdtemp(path.join(os.tmpdir(), "zilobase-dev-workers-"));
const calendarEnabled = isFeatureFlagEnabled(stackEnv.CALENDAR_ENABLED);
const mailEnabled = isFeatureFlagEnabled(stackEnv.MAIL_ENABLED);
const workerStackEnvFile = path.join(temporaryDir, "worker-stack.env");
const writeWorkerEnvFile = (file, names) => writeFile(
  file,
  names.flatMap((name) => {
    const value = stackEnv[name]?.trim();
    return value ? [`${name}=${quoteDotEnv(value)}`] : [];
  }).join("\n"),
  { mode: 0o600 },
);
await writeWorkerEnvFile(workerStackEnvFile, [
  ...new Set([
    ...requiredRuntimeSecretNames({ mailEnabled, calendarEnabled }),
    ...requiredBackgroundRuntimeSecretNames({ mailEnabled, calendarEnabled }),
  ]),
]);
stackEnv.ZILOBASE_WRANGLER_ENV_FILE = workerStackEnvFile;
process.once("exit", cleanupTemporaryEnv);
const appDir = path.resolve(
  adapterDir,
  stackEnv.ZILOBASE_APP_DIR ?? "../zilobase",
);
const wrangler = path.join(
  adapterDir,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);
await alignLocalPackage(appDir, "server", "apps/server");
await alignLocalPackage(appDir, "features", "packages/features");
console.info("Applying local database migrations...");
await runCommand(
  "npm",
  ["run", "db:migrate", "--workspace", "@zilobase/server"],
  { cwd: appDir, env: stackEnv },
);
if (stackEnv.ZILOBASE_DEMO_ENABLED?.trim().toLowerCase() === "true") {
  console.info("Seeding the local demo workspace...");
  await runCommand(
    "npm",
    ["run", "db:seed:demo", "--workspace", "@zilobase/server"],
    { cwd: appDir, env: stackEnv },
  );
}
console.info("Starting the local API and background Workers...");
const children = [
  spawn(process.execPath, [wrangler, ...workerStackDevArgs(stackEnv)], {
    cwd: adapterDir,
    env: stackEnv,
    stdio: "inherit",
  }),
];
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => stop(signal));
}

const result = await Promise.race(
  children.map(
    (child) =>
      new Promise((resolve) => {
        child.once("error", (error) => resolve({ error }));
        child.once("exit", (code, signal) => resolve({ code, signal }));
      }),
  ),
);

stop("SIGTERM");

if (result.error) {
  throw result.error;
}

process.exitCode = result.code ?? (result.signal ? 1 : 0);

function stop(signal) {
  if (stopping) return;
  stopping = true;

  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
  cleanupTemporaryEnv();
}

function cleanupTemporaryEnv() {
  rmSync(temporaryDir, { force: true, recursive: true });
}

function quoteDotEnv(value) {
  return `"${value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n")}"`;
}

async function alignLocalPackage(appDir, packageName, relativeSource) {
  const packageDir = path.join(adapterDir, "node_modules", "@zilobase");
  const packageLink = path.join(packageDir, packageName);
  const sourceDir = path.join(appDir, ...relativeSource.split("/"));

  if (!existsSync(sourceDir)) {
    throw new Error(`Zilobase package not found at ${sourceDir}.`);
  }

  const stats = await lstat(packageLink).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });

  if (stats) {
    if (!stats.isSymbolicLink()) {
      throw new Error(
        `${packageLink} must be a symlink so ZILOBASE_APP_DIR can select the local server package.`,
      );
    }

    const currentTarget = path.resolve(
      packageDir,
      await readlink(packageLink),
    );
    if (currentTarget === sourceDir) return;
    await unlink(packageLink);
  }

  await mkdir(packageDir, { recursive: true });
  await symlink(path.relative(packageDir, sourceDir), packageLink, "dir");
  console.info(`Linked @zilobase/${packageName} from ${sourceDir}`);
}
