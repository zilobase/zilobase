import { constants, rmSync } from "node:fs";
import { access, mkdir, readFile, readdir, rm, stat, watch, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import {
  composeFile,
  composeProject,
  coreDir,
  generatedEnvironmentFiles,
  localProfiles,
  kindCluster,
  runtimeStateFile,
  stateDir,
  apiUrl,
  runtimeUrl,
} from "./config.mjs";
import {
  ensureDevelopmentEnvironment,
  loadGeneratedEnvironment,
  loadProfileEnvironment,
} from "./env.mjs";
import {
  composeLogsHint,
  ensureDockerSocket,
  resolveComposeRunner,
} from "./docker.mjs";
import {
  assertPortsAvailable,
  run,
  runResult,
  spawnService,
  stopChildren,
  waitForUrl,
} from "./process.mjs";

export function resolveLocalProfileNames() {
  return ["node"];
}

export function resolveStudioServices() {
  return [localProfiles.node].map((profile) => ({
    name: profile.name,
    port: profile.studioPort,
    database: profile.database,
    envFile: generatedEnvironmentFiles[profile.name],
  }));
}

export function nodeApiArguments(profile) {
  return [
    `--inspect=127.0.0.1:${profile.inspectorPort}`,
    "--enable-source-maps",
    path.join(coreDir, "node_modules", "tsx", "dist", "cli.mjs"),
    "watch",
    "--include",
    "drizzle/**/*.sql",
    "--include",
    "../../packages/features/src/databases/**/*.ts",
    "src/entrypoints/serverful.ts",
  ];
}

export function studioBrowserUrl(port) {
  const url = new URL("https://local.drizzle.studio");
  if (port !== localProfiles.node.studioPort) {
    url.searchParams.set("port", String(port));
  }
  return url.toString().replace(/\/$/, "");
}

export async function startLocal() {
  await startRuntime({ spawnWeb, printSummary: printLocalSummary, processLabel: "Development" });
}

export async function startPreview() {
  await startRuntime({ spawnWeb: spawnWebPreview, printSummary: printPreviewSummary, processLabel: "Preview" });
}

async function startRuntime({ spawnWeb: spawnWebFn, printSummary, processLabel }) {
  const names = resolveLocalProfileNames();
  await ensureDevelopmentEnvironment();

  const { environments, profiles } = await resolveRuntimeProfiles(names);
  await assertPortsAvailable(collectProfilePorts(names, profiles));
  await dependencies(["up", "-d", "postgres", "minio", "mailpit", "valkey", "--wait"]);
  await dependencies(["run", "--rm", "-T", "minio-init"]);

  const logDir = path.join(stateDir, "logs");
  await mkdir(logDir, { recursive: true });
  const children = [];
  let stopping = false;
  let stopPromise;
  const stop = (signal = "SIGTERM") => {
    if (stopPromise) return stopPromise;
    stopping = true;
    // npm and the child Node process receive Ctrl-C together. Remove the small
    // supervisor marker immediately so npm cannot exit ahead of async cleanup.
    rmSync(runtimeStateFile, { force: true });
    stopPromise = (async () => {
      await stopChildren(children, signal);
    })();
    return stopPromise;
  };

  try {
    let color = 0;
    if (names.includes("node")) {
      const spawned = await spawnNodeProfile(profiles.node, environments.node, logDir, spawnWebFn, color);
      children.push(...spawned.children);
      color = spawned.color;
    }
    await mkdir(stateDir, { recursive: true });
    await writeFile(runtimeStateFile, `${JSON.stringify({
      profiles: Object.fromEntries(names.map((name) => [name, profiles[name]])),
      pids: children.map((child) => child.pid).filter(Boolean),
      startedAt: new Date().toISOString(),
    }, null, 2)}
`, { mode: 0o600 });

    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
      process.once(signal, () => void stop(signal));
    }
    process.once("exit", () => rmSync(runtimeStateFile, { force: true }));

    await waitForRuntimeReadiness(names, profiles, children);
    printSummary(names, profiles);

    const result = await awaitFirstExit(children);
    if (!stopping && result.error) throw result.error;
    if (!stopping && result.code !== 0) {
      throw new Error(`${processLabel} process exited with ${result.signal ?? result.code}.`);
    }
  } finally {
    await stop();
  }
}

async function resolveRuntimeProfiles(names) {
  const environments = Object.fromEntries(
    await Promise.all(names.map(async (name) => [name, await loadProfileEnvironment(name)])),
  );
  const profiles = Object.fromEntries(
    names.map((name) => [name, effectiveProfile(name, environments[name])]),
  );
  return { environments, profiles };
}

function collectProfilePorts(names, profiles) {
  return names.flatMap((name) => {
    const profile = profiles[name];
    return [
      profile.appPort,
      profile.apiPort,
      profile.inspectorPort,
      ...(profile.healthPort ? [profile.healthPort] : []),
      ...(profile.backgroundPort ? [profile.backgroundPort] : []),
      ...(profile.backgroundInspectorPort ? [profile.backgroundInspectorPort] : []),
    ];
  });
}

async function spawnNodeProfile(profile, environment, logDir, spawnWebFn, color) {
  const env = runtimeEnvironment(profile, environment);
  await run("npm", ["run", "db:migrate", "--workspace", "@zilobase/server"], {
    cwd: coreDir,
    env,
  });
  if (env.ZILOBASE_DEMO_ENABLED?.trim().toLowerCase() === "true") {
    await run("npm", ["run", "db:seed:demo", "--workspace", "@zilobase/server"], {
      cwd: coreDir,
      env,
    });
  }
  const children = [
    spawnService(
      "node-api",
      process.execPath,
      nodeApiArguments(profile),
      {
        cwd: path.join(coreDir, "apps", "server"),
        logFile: path.join(logDir, "node-api.log"),
        env: {
          ...env,
          PORT: String(profile.apiPort),
          ZILOBASE_AUTO_MIGRATE: "true",
          AI_DEV_TOOLS_ENABLED: "true",
          AI_AGENT_DAILY_USAGE_LIMITS_ENABLED: "false",
        },
      },
      color++,
    ),
    spawnWebFn("node-web", profile, env, color++),
  ];
  return { children, color };
}

function awaitFirstExit(children) {
  return Promise.race(children.map((child) => new Promise((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  })));
}

export async function startStudio() {
  await ensureDevelopmentEnvironment();
  const services = resolveStudioServices();
  await assertPortsAvailable(services.map((service) => service.port));
  await dependencies(["up", "-d", "postgres", "--wait"]);

  const children = [];
  let stopping = false;
  let stopPromise;
  const stop = (signal = "SIGTERM") => {
    if (stopPromise) return stopPromise;
    stopping = true;
    stopPromise = stopChildren(children, signal);
    return stopPromise;
  };

  try {
    let color = 0;
    for (const service of services) {
      const generated = await loadGeneratedEnvironment(service.envFile);
      if (!generated.DATABASE_URL?.trim()) {
        throw new Error(`${service.name} DATABASE_URL is missing from the generated local environment.`);
      }
      children.push(spawnService(
        `${service.name}-studio`,
        process.execPath,
        [
          path.join(coreDir, "node_modules", "drizzle-kit", "bin.cjs"),
          "studio",
          "--host",
          "127.0.0.1",
          "--port",
          String(service.port),
        ],
        {
          cwd: path.join(coreDir, "apps", "server"),
          env: {
            ...process.env,
            ...generated,
            DATABASE_URL: generated.DATABASE_URL,
            ZILOBASE_ENV_FILE: service.envFile,
          },
        },
        color++,
      ));
    }

    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
      process.once(signal, () => void stop(signal));
    }

    await waitForStudioReadiness(services, children);
    printStudioSummary(services);

    const result = await Promise.race(children.map((child) => new Promise((resolve) => {
      child.once("error", (error) => resolve({ error }));
      child.once("exit", (code, signal) => resolve({ code, signal }));
    })));
    if (!stopping && result.error) throw result.error;
    if (!stopping && result.code !== 0) {
      throw new Error(`Drizzle Studio exited with ${result.signal ?? result.code}.`);
    }
  } finally {
    await stop();
  }
}

export async function showStatus() {
  await ensureDevelopmentEnvironment();
  console.info("Dependency containers:");
  const compose = await dependencies(["ps"], { reject: false });
  if (compose.stdout) process.stdout.write(compose.stdout);
  if (compose.stderr) process.stderr.write(compose.stderr);

  console.info("\nRuntime endpoints:");
  const state = await readRuntimeState();
  const livePids = (state?.pids ?? []).filter(isRunningPid);
  const profiles = state?.profiles && !Array.isArray(state.profiles)
    ? Object.values(state.profiles)
    : Object.values(localProfiles);
  console.info(
    livePids.length
      ? `Managed supervisor PIDs: ${livePids.join(", ")}`
      : state
        ? "Managed supervisor: stopped (stale state will be removed by dev:down)"
      : "Managed supervisor: stopped (responding default ports are external/unmanaged)",
  );
  for (const profile of profiles) {
    const api = await probe(`http://127.0.0.1:${profile.apiPort}/ready`);
    const web = await probe(`http://127.0.0.1:${profile.appPort}`);
    console.info(`${profile.name.padEnd(7)} API ${api.padEnd(10)} web ${web.padEnd(10)} ${runtimeUrl(profile)}`);
  }
}

export async function followDependencyLogs() {
  await ensureDevelopmentEnvironment();
  await dependencies(["logs", "--follow", "--tail", "200"]);
}

export async function followLocalLogs() {
  const logDir = path.join(stateDir, "logs");
  await mkdir(logDir, { recursive: true });
  const files = (await readdir(logDir))
    .filter((name) => name.endsWith(".log"))
    .map((name) => path.join(logDir, name));
  if (!files.length) {
    console.info("No runtime logs yet. Start npm run dev first.");
    return;
  }
  const offsets = new Map();
  for (const filename of files) {
    const content = await readFile(filename, "utf8");
    const lines = content.trimEnd().split("\n");
    console.info(lines.slice(-200).join("\n"));
    offsets.set(filename, Buffer.byteLength(content));
  }
  console.info(`\nFollowing runtime logs. Press Ctrl-C to stop. Dependency logs: ${composeLogsHint()}`);
  const watcher = watch(logDir);
  for await (const event of watcher) {
    if (!event.filename?.endsWith(".log")) continue;
    const filename = path.join(logDir, event.filename);
    const offset = offsets.get(filename) ?? 0;
    let size;
    try { size = (await stat(filename)).size; } catch { continue; }
    if (size < offset) offsets.set(filename, 0);
    const content = await readFile(filename);
    const start = offsets.get(filename) ?? 0;
    if (content.length > start) process.stdout.write(content.subarray(start));
    offsets.set(filename, content.length);
  }
}

export async function stopLocal() {
  await stopRuntimeProcesses();
  if (await exists(generatedEnvironmentFiles.dependencies)) {
    await dependencies(["down", "--remove-orphans"]);
  }
  console.info("Local runtime processes stopped; database and object-storage volumes were preserved.");
}

export async function resetLocal(target, confirmed) {
  if (!["node", "community", "all"].includes(target)) {
    throw new Error("Reset target must be node, community, or all.");
  }
  if (!confirmed) {
    throw new Error(`Reset deletes ${target} development data. Re-run with --yes to confirm.`);
  }
  await stopRuntimeProcesses();
  await ensureDevelopmentEnvironment();

  if (target === "all") {
    await dependencies(["down", "--volumes", "--remove-orphans"]);
    const kind = runResult("kind", ["delete", "cluster", "--name", kindCluster]);
    if (kind.status !== 0 && kind.error?.code !== "ENOENT") process.stderr.write(kind.stderr ?? "");
    console.info("All local runtime data was removed.");
    return;
  }

  if (target === "node") {
    await dependencies(["up", "-d", "postgres", "minio", "mailpit", "valkey", "--wait"]);
    await dependencies(["run", "--rm", "-T", "minio-init"]);
    await recreateDatabase(localProfiles[target].database);
    if (target === "node") await resetNodeBucket();
    console.info(`Reset isolated ${target} development data.`);
    return;
  }

  for (const namespace of ["zilobase-community-dev"]) {
    const result = runResult("kubectl", [
      "delete", "namespace", namespace, "--ignore-not-found=true",
    ]);
    if (result.error?.code === "ENOENT") {
      throw new Error("kubectl is required to reset Kubernetes data.");
    }
    if (result.status !== 0) {
      throw new Error(result.stderr || `Unable to delete ${namespace}.`);
    }
  }
  await rm(path.join(stateDir, `k8s-${target}-smoke.json`), { force: true });
  console.info(`Reset isolated ${target} Kubernetes data.`);
}

function spawnWeb(name, profile, env, color) {
  return spawnService(
    name,
    process.execPath,
    [path.join(coreDir, "node_modules", "vite", "bin", "vite.js")],
    {
      cwd: path.join(coreDir, "apps", "web"),
      logFile: path.join(stateDir, "logs", `${name}.log`),
      env: {
        ...env,
        ZILOBASE_VITE_CACHE_DIR: webCacheDirectory(profile),
        VITE_API_URL: env.VITE_API_URL ?? apiUrl(profile),
        VITE_DEV_HOST: "0.0.0.0",
        VITE_DEV_PORT: String(profile.appPort),
      },
    },
    color,
  );
}

function spawnWebPreview(name, profile, env, color) {
  return spawnService(
    name,
    process.execPath,
    [path.join(coreDir, "node_modules", "vite", "bin", "vite.js"), "preview", "--host", "0.0.0.0", "--port", String(profile.appPort)],
    {
      cwd: path.join(coreDir, "apps", "web"),
      logFile: path.join(stateDir, "logs", `${name}.log`),
      env: {
        ...env,
        VITE_API_URL: env.VITE_API_URL ?? apiUrl(profile),
      },
    },
    color,
  );
}

async function dependencies(args, options = {}) {
  ensureDockerSocket();
  const compose = resolveComposeRunner();
  const env = await loadGeneratedEnvironment(generatedEnvironmentFiles.dependencies);
  const commandArgs = [
    ...compose.args,
    "--project-name",
    composeProject,
    "--env-file",
    generatedEnvironmentFiles.dependencies,
    "-f",
    composeFile,
    ...args,
  ];
  if (options.reject === false) return runResult(compose.command, commandArgs, { cwd: coreDir, env: { ...process.env, ...env } });
  return run(compose.command, commandArgs, { cwd: coreDir, env: { ...process.env, ...env } });
}

async function recreateDatabase(database) {
  const env = await loadGeneratedEnvironment(generatedEnvironmentFiles.dependencies);
  for (const sql of databaseResetStatements(database)) {
    await dependencies([
      "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1",
      "-U", env.POSTGRES_USER, "-d", "postgres", "-c", sql,
    ]);
  }
}

export function databaseResetStatements(database) {
  if (!/^[a-z][a-z0-9_]*$/.test(database)) {
    throw new Error("Development database name is invalid.");
  }
  return [
    `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`,
    `CREATE DATABASE ${database};`,
  ];
}

async function resetNodeBucket() {
  await dependencies([
    "run", "--rm", "-T", "--no-deps", "minio-init",
    "mc alias set local http://minio:9000 \"$MINIO_ROOT_USER\" \"$MINIO_ROOT_PASSWORD\" && " +
      "mc rb --force local/zilobase-node || true; mc mb local/zilobase-node; mc anonymous set none local/zilobase-node",
  ]);
}

async function stopRuntimeProcesses() {
  const state = await readRuntimeState();
  for (const pid of state?.pids ?? []) {
    if (!isRunningPid(pid)) continue;
    const result = await runResult("ps", ["-p", String(pid), "-o", "command="], {
      reject: false,
    });
    if (!/(serverful\.ts|vite(?:\.js)?)/.test(result.stdout)) {
      console.warn(`Skipped PID ${pid}: it no longer belongs to the Zilobase supervisor.`);
      continue;
    }
    try { process.kill(pid, "SIGTERM"); } catch (error) { if (error?.code !== "ESRCH") throw error; }
  }
  await rm(runtimeStateFile, { force: true });
}

function isRunningPid(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return error?.code === "EPERM";
  }
}

async function readRuntimeState() {
  try {
    return JSON.parse(await readFile(runtimeStateFile, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function probe(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
    return response.ok ? "ready" : `HTTP ${response.status}`;
  } catch {
    return "stopped";
  }
}

function printStudioSummary(services) {
  console.info("\nDrizzle Studio is ready for the local database:\n");
  for (const service of services) {
    console.info(
      `${service.name.padEnd(7)} ${studioBrowserUrl(service.port)}  ${service.database}  127.0.0.1:${service.port}`,
    );
  }
  console.info("Keep npm run dev in another terminal. Ctrl-C stops Studio and preserves data.\n");
}

function printLocalSummary(names, profiles = localProfiles) {
  console.info("\nZilobase development runtimes are ready:\n");
  for (const name of names) {
    const profile = profiles[name];
    console.info(`${name.padEnd(7)} ${runtimeUrl(profile)}  API ${apiUrl(profile)}  inspector ${profile.inspectorPort}`);
  }
  console.info("Mailpit http://127.0.0.1:18025");
  console.info("MinIO  http://127.0.0.1:19101");
  console.info("\nCtrl-C stops source processes and preserves dependency data.\n");
}

function printPreviewSummary(names, profiles = localProfiles) {
  console.info("\nZilobase preview runtimes are ready (built web assets):\n");
  for (const name of names) {
    const profile = profiles[name];
    console.info(`${name.padEnd(7)} ${runtimeUrl(profile)}  API ${apiUrl(profile)}  inspector ${profile.inspectorPort}`);
  }
  console.info("Mailpit http://127.0.0.1:18025");
  console.info("MinIO  http://127.0.0.1:19101");
  console.info("\nCtrl-C stops processes and preserves dependency data.\n");
}

export function effectiveProfile(name, env) {
  if (name !== "node") throw new Error(`Unknown local profile: ${name}`);
  const profile = { ...localProfiles[name] };
  profile.apiPort = readPort(env.PORT, profile.apiPort);
  profile.healthPort = readPort(env.BACKGROUND_HEALTH_PORT, profile.healthPort);
  profile.appPort = readPort(env.ZILOBASE_NODE_WEB_PORT, profile.appPort);
  profile.inspectorPort = readPort(
    env.ZILOBASE_NODE_INSPECTOR_PORT,
    profile.inspectorPort,
  );
  return profile;
}

export function webCacheDirectory(profile, rootDir = stateDir) {
  return path.join(rootDir, "vite", profile.name);
}

export function runtimeEnvironment(profile, env) {
  if (env.ZILOBASE_DEV_PUBLIC_ORIGIN) return { ...env, VITE_BACKEND_PROXY_TARGET: apiUrl(profile) };
  const origin = apiUrl(profile);
  const client = runtimeUrl(profile);
  return {
    ...env,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? origin,
    CLIENT_URL: process.env.CLIENT_URL ?? client,
    COLLABORATION_WEBSOCKET_URL:
      process.env.COLLABORATION_WEBSOCKET_URL ?? websocketUrl(profile, "/collaboration"),
    DATABASE_REALTIME_WEBSOCKET_URL:
      process.env.DATABASE_REALTIME_WEBSOCKET_URL ??
      websocketUrl(profile, "/database-collaboration"),
    MEETING_AUDIO_WEBSOCKET_URL:
      process.env.MEETING_AUDIO_WEBSOCKET_URL ?? websocketUrl(profile, "/meeting-audio"),
    MEETING_COLLABORATION_WEBSOCKET_URL:
      process.env.MEETING_COLLABORATION_WEBSOCKET_URL ??
      websocketUrl(profile, "/meeting-collaboration"),
    NAVIGATION_REALTIME_WEBSOCKET_URL:
      process.env.NAVIGATION_REALTIME_WEBSOCKET_URL ??
      websocketUrl(profile, "/navigation-realtime"),
  };
}

function websocketUrl(profile, pathname) {
  return `ws://${profile.apiHost}:${profile.apiPort}${pathname}`;
}

async function waitForStudioReadiness(services, children) {
  const ready = Promise.all(services.map((service) => waitForTcp(service.port)));
  const exited = Promise.race(children.map((child) => new Promise((_, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      reject(new Error(
        `Drizzle Studio exited before readiness with ${signal ?? code}.`,
      ));
    });
  })));
  await Promise.race([ready, exited]);
}

function waitForTcp(port, host = "127.0.0.1") {
  const timeoutMs = 30_000;
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ port, host }, () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Timed out waiting for Drizzle Studio on ${host}:${port}`));
          return;
        }
        setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

async function waitForRuntimeReadiness(names, profiles, children) {
  const ready = Promise.all(names.map(async (name) => {
    const profile = profiles[name];
    await waitForUrl(`http://127.0.0.1:${profile.apiPort}/ready`);
    await waitForUrl(`http://127.0.0.1:${profile.appPort}`);
  }));
  const exited = Promise.race(children.map((child) => new Promise((_, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      reject(new Error(
        `Development process exited before readiness with ${signal ?? code}.`,
      ));
    });
  })));
  await Promise.race([ready, exited]);
}

function readPort(value, fallback) {
  const port = Number(value);
  return Number.isSafeInteger(port) && port > 0 && port <= 65_535 ? port : fallback;
}

async function exists(filename) {
  try { await access(filename, constants.F_OK); return true; } catch { return false; }
}
