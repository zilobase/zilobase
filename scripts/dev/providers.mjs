import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { coreDir } from "./config.mjs";
import { run } from "./process.mjs";

export const DEVELOPMENT_PROVIDER_FILE = ".zilobase-dev.json";

export async function discoverDevelopmentProviders(workspaceDir = path.dirname(coreDir)) {
  const entries = await readdir(workspaceDir, { withFileTypes: true });
  const providers = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const directory = path.join(workspaceDir, entry.name);
    const filename = path.join(directory, DEVELOPMENT_PROVIDER_FILE);
    if (!(await exists(filename))) continue;
    const descriptor = JSON.parse(await readFile(filename, "utf8"));
    providers.push(validateDevelopmentProvider(descriptor, directory));
  }
  return providers.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}

export function validateDevelopmentProvider(descriptor, directory) {
  if (!descriptor || descriptor.schemaVersion !== 1) {
    throw new Error(`Unsupported development provider descriptor in ${directory}.`);
  }
  if (!validIdentifier(descriptor.id)) {
    throw new Error(`Development provider in ${directory} has an invalid id.`);
  }
  validateCommand(descriptor.start, descriptor.id, "start");
  if (descriptor.stop) validateCommand(descriptor.stop, descriptor.id, "stop");
  if (descriptor.describe) validateCommand(descriptor.describe, descriptor.id, "describe");
  if (!Array.isArray(descriptor.readiness) || descriptor.readiness.some((url) => !isLoopbackHttpUrl(url))) {
    throw new Error(`Development provider ${descriptor.id} must declare loopback readiness URLs.`);
  }
  return {
    ...descriptor,
    directory,
    order: Number.isFinite(descriptor.order) ? descriptor.order : 100,
  };
}

export function startDevelopmentProvider(provider, environment = process.env) {
  const [command, ...args] = provider.start;
  return spawn(resolveExecutable(command), args, {
    cwd: provider.directory,
    env: providerEnvironment(environment),
    stdio: "inherit",
  });
}

export function withSharedRealtimeRedis(environment, nodeEnvironment) {
  return {
    ...environment,
    REALTIME_REDIS_URL: nodeEnvironment.REALTIME_REDIS_URL,
  };
}

export async function waitForDevelopmentProvider(provider, child) {
  const ready = Promise.all(provider.readiness.map((url) => waitForProviderUrl(url, child)));
  const exited = new Promise((_, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => reject(new Error(
      `Development provider ${provider.id} exited before readiness with ${signal ?? code}.`,
    )));
  });
  await Promise.race([ready, exited]);
}

export async function describeDevelopmentProvider(provider, environment = process.env) {
  if (!provider.describe) return provider.model ?? {};
  const [command, ...args] = provider.describe;
  const output = [];
  const child = spawn(resolveExecutable(command), args, {
    cwd: provider.directory,
    env: providerEnvironment(environment),
    stdio: ["ignore", "pipe", "inherit"],
  });
  child.stdout.on("data", (chunk) => output.push(chunk));
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Development provider ${provider.id} describe exited with ${signal ?? code}.`));
    });
  });
  return JSON.parse(Buffer.concat(output).toString("utf8"));
}

export async function stopDevelopmentProvider(provider, environment = process.env) {
  if (!provider.stop) return;
  const [command, ...args] = provider.stop;
  await run(resolveExecutable(command), args, {
    cwd: provider.directory,
    env: providerEnvironment(environment),
  });
}

export async function stopDevelopmentChildren(children, signal = "SIGTERM") {
  const live = children.filter((child) => child.exitCode === null);
  for (const child of live) child.kill(signal);
  await Promise.all(live.map((child) => new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve();
    }, 30_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  })));
}

function providerEnvironment(environment) {
  return { ...environment, ZILOBASE_CORE_DIR: coreDir };
}

async function waitForProviderUrl(url, child) {
  const deadline = Date.now() + 240_000;
  let lastError = "not reachable";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Provider process exited while waiting for ${url}.`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function validateCommand(command, id, kind) {
  if (!Array.isArray(command) || !command.length || command.some((part) => typeof part !== "string" || !part)) {
    throw new Error(`Development provider ${id} has an invalid ${kind} command.`);
  }
}

function resolveExecutable(command) {
  if (command === "node") return process.execPath;
  if (command === "npm" && process.platform === "win32") return "npm.cmd";
  return command;
}

function validIdentifier(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]*$/.test(value);
}

function isLoopbackHttpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}

async function exists(filename) {
  try {
    await access(filename, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
