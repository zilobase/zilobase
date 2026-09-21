#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { coreDir, generatedEnvironmentFiles, localProfiles } from "./config.mjs";
import { DEFAULT_DASHBOARD_PORT, developmentDashboardModel, startDevelopmentDashboard } from "./dashboard.mjs";
import { ensureDevelopmentEnvironment, loadGeneratedEnvironment, loadProfileEnvironment } from "./env.mjs";
import { effectiveProfile } from "./local.mjs";
import { assertPortsAvailable } from "./process.mjs";
import {
  describeDevelopmentProvider,
  discoverDevelopmentProviders,
  startDevelopmentProvider,
  stopDevelopmentChildren,
  stopDevelopmentProvider,
  waitForDevelopmentProvider,
  withSharedRealtimeRedis,
} from "./providers.mjs";

export async function startDevelopmentWorkspace() {
  const providers = await discoverDevelopmentProviders();
  await ensureDevelopmentEnvironment();
  const nodeEnvironment = await loadProfileEnvironment("node");
  const nodeProfile = effectiveProfile("node", nodeEnvironment);
  await assertPortsAvailable([DEFAULT_DASHBOARD_PORT]);

  const children = [];
  const startedProviders = [];
  let dashboard;
  let stopping = false;
  let stopPromise;
  const stop = (signal = "SIGTERM") => {
    if (stopPromise) return stopPromise;
    stopping = true;
    stopPromise = (async () => {
      await dashboard?.close();
      await stopDevelopmentChildren(children, signal);
      for (const provider of [...startedProviders].reverse()) {
        try {
          await stopDevelopmentProvider(provider);
        } catch (error) {
          console.warn(`Unable to stop development provider ${provider.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    })();
    return stopPromise;
  };
  const signalHandlers = new Map(
    ["SIGINT", "SIGTERM", "SIGHUP"].map((signal) => [signal, () => void stop(signal)]),
  );
  for (const [signal, handler] of signalHandlers) process.once(signal, handler);

  try {
    console.info("Starting Community self-hosted development runtime...");
    const coreChild = spawn(process.execPath, [path.join(coreDir, "scripts/dev/cli.mjs"), "local"], {
      cwd: coreDir,
      env: process.env,
      stdio: "inherit",
    });
    children.push(coreChild);
    await waitForDevelopmentProvider({
      id: "community",
      readiness: [
        `http://127.0.0.1:${nodeProfile.apiPort}/ready`,
        `http://127.0.0.1:${nodeProfile.appPort}`,
      ],
    }, coreChild);

    for (const provider of providers) {
      if (stopping) break;
      console.info(`Starting optional development provider: ${provider.id}...`);
      const child = startDevelopmentProvider(
        provider,
        withSharedRealtimeRedis(process.env, nodeEnvironment),
      );
      children.push(child);
      startedProviders.push(provider);
      await waitForDevelopmentProvider(provider, child);
    }
    if (stopping) return;

    const providerModels = await Promise.all(startedProviders.map((provider) => describeDevelopmentProvider(provider)));
    const dependencies = await loadGeneratedEnvironment(generatedEnvironmentFiles.dependencies);
    dashboard = await startDevelopmentDashboard({
      model: developmentDashboardModel({
        credentials: [{
          description: "Initial setup credential for the Community self-hosted runtime.",
          fields: [["Bootstrap token", nodeEnvironment.ZILOBASE_BOOTSTRAP_TOKEN]],
          name: "Community setup",
        }, {
          description: "Local infrastructure credentials shared by development runtimes.",
          fields: [
            ["Postgres user", dependencies.POSTGRES_USER],
            ["Postgres password", dependencies.POSTGRES_PASSWORD],
            ["MinIO user", dependencies.MINIO_ROOT_USER],
            ["MinIO password", dependencies.MINIO_ROOT_PASSWORD],
          ],
          name: "Infrastructure",
        }],
        profiles: { node: nodeProfile },
        providerModels,
        services: [{
          detail: "Mailpit inbox for application OTPs",
          name: "Development email",
          url: `http://127.0.0.1:${dependencies.MAILPIT_UI_PORT}`,
        }, {
          detail: "MinIO object storage console",
          name: "Object storage",
          url: `http://127.0.0.1:${dependencies.MINIO_CONSOLE_PORT}`,
        }],
      }),
      open: process.env.ZILOBASE_DEV_DASHBOARD_OPEN !== "false",
    });

    console.info(`\nAll detected development runtimes are ready.`);
    console.info(`Development hub ${dashboard.url}`);
    console.info("Ctrl-C stops every managed runtime and preserves local data.\n");

    const result = await firstExit(children);
    if (!stopping && result.error) throw result.error;
    if (!stopping) throw new Error(`Development service exited with ${result.signal ?? result.code}.`);
  } finally {
    await stop();
    for (const [signal, handler] of signalHandlers) process.off(signal, handler);
  }
}

export async function launchDevelopmentWorkspace() {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: coreDir,
    detached: process.platform !== "win32",
    env: { ...process.env, ZILOBASE_DEV_WORKSPACE_CHILD: "1" },
    stdio: "inherit",
  });
  const forward = (signal) => {
    if (child.exitCode === null) child.kill(signal);
  };
  const signalHandlers = new Map(
    ["SIGINT", "SIGTERM", "SIGHUP"].map((signal) => [signal, () => forward(signal)]),
  );
  for (const [signal, handler] of signalHandlers) process.on(signal, handler);
  const result = await new Promise((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  for (const [signal, handler] of signalHandlers) process.off(signal, handler);
  if (result.error) throw result.error;
  if (result.code !== 0) throw new Error(`Development workspace exited with ${result.signal ?? result.code}.`);
}

function firstExit(children) {
  return Promise.race(children.map((child) => new Promise((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  })));
}

function isMain() {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  try {
    if (process.env.ZILOBASE_DEV_WORKSPACE_CHILD === "1") {
      await startDevelopmentWorkspace();
    } else {
      await launchDevelopmentWorkspace();
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
