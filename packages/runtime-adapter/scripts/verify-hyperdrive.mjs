import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const adapterDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const wranglerConfigPath = process.env.HYPERDRIVE_WRANGLER_CONFIG ?? "deploy/worker/wrangler.jsonc";
const wranglerConfig = JSON.parse(
  stripJsonComments(await readFile(path.join(adapterDir, wranglerConfigPath), "utf8")),
);
const binding = wranglerConfig.hyperdrive?.find(
  (candidate) => candidate.binding === "HYPERDRIVE",
);

if (!binding?.id) {
  throw new Error(`${wranglerConfigPath} must define the HYPERDRIVE binding.`);
}

const output = await runWrangler([
  "hyperdrive",
  "get",
  binding.id,
]);
const config = readJsonObject(output);
const expectedHost = requiredEnv("HYPERDRIVE_EXPECTED_HOST");
const expectedPort = Number(requiredEnv("HYPERDRIVE_EXPECTED_PORT"));
const expectedConnectionLimit = Number(
  process.env.HYPERDRIVE_EXPECTED_CONNECTION_LIMIT ?? "5",
);
const expected = {
  cachingDisabled: true,
  connectionLimit: expectedConnectionLimit,
  host: expectedHost,
  id: binding.id,
  port: expectedPort,
};
const failures = [
  config.id === expected.id || `id must be ${expected.id}`,
  config.origin?.host === expected.host || `origin host must be ${expected.host}`,
  config.origin?.port === expected.port || `origin port must be ${expected.port}`,
  config.origin_connection_limit === expected.connectionLimit ||
    `origin connection limit must be ${expected.connectionLimit}`,
  config.caching?.disabled === expected.cachingDisabled ||
    "query caching must be disabled",
].filter((result) => result !== true);

if (failures.length > 0) {
  throw new Error(`Hyperdrive preflight failed: ${failures.join("; ")}.`);
}

console.info(
  `Hyperdrive preflight passed (${config.name}, ${expected.connectionLimit} origin connections, cache disabled).`,
);

function runWrangler(args) {
  const wranglerBin = path.join(
    adapterDir,
    "node_modules",
    "wrangler",
    "bin",
    "wrangler.js",
  );

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wranglerBin, ...args], {
      cwd: adapterDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve(`${stdout}\n${stderr}`);
      else reject(new Error(
        `Wrangler Hyperdrive inspection failed with code ${code}: ${stderr.trim() || stdout.trim()}`,
      ));
    });
  });
}

function readJsonObject(value) {
  const normalized = value.replace(/\u001b\[[0-9;]*m/g, "");
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("Wrangler did not return Hyperdrive JSON.");
  }
  return JSON.parse(normalized.slice(start, end + 1));
}

function stripJsonComments(value) {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required to verify the Hyperdrive origin.`);
  }
  return value;
}
