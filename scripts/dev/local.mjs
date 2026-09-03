import { constants, rmSync } from "node:fs";
import { access, mkdir, readFile, readdir, rm, stat, watch, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  adapterDir,
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
  assertPortsAvailable,
  run,
  runResult,
  spawnService,
  stopChildren,
  waitForUrl,
} from "./process.mjs";

export async function startLocal(target = "all") {
  const names = target === "all" ? ["node", "worker"] : [target];
  if (names.some((name) => !localProfiles[name])) {
    throw new Error("Local target must be node, worker, or all.");
  }
  if (names.includes("worker") && !(await exists(path.join(adapterDir, "package.json")))) {
    throw new Error(`Cloud adapter repository not found at ${adapterDir}.`);
  }

  await ensureDevelopmentEnvironment();
  const environments = Object.fromEntries(
    await Promise.all(names.map(async (name) => [name, await loadProfileEnvironment(name)])),
  );
  const profiles = Object.fromEntries(
    names.map((name) => [name, effectiveProfile(name, environments[name])]),
  );
  const ports = names.flatMap((name) => {
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
  await assertPortsAvailable(ports);
  await dependencies(["up", "-d", "postgres", "minio", "mailpit", "--wait"]);
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
      const env = runtimeEnvironment(profiles.node, environments.node);
      const profile = profiles.node;
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
      children.push(spawnService(
        "node-api",
        process.execPath,
        [
          `--inspect=127.0.0.1:${profile.inspectorPort}`,
          "--enable-source-maps",
          "--import",
          "tsx",
          "src/entrypoints/serverful.ts",
        ],
        {
          cwd: path.join(coreDir, "apps", "server"),
          logFile: path.join(logDir, "node-api.log"),
          env: {
            ...env,
            PORT: String(profile.apiPort),
            AI_DEV_TOOLS_ENABLED: "true",
            AI_AGENT_DAILY_USAGE_LIMITS_ENABLED: "false",
          },
        },
        color++,
      ));
      children.push(spawnWeb("node-web", profile, env, color++));
    }

    if (names.includes("worker")) {
      const env = runtimeEnvironment(profiles.worker, environments.worker);
      const profile = profiles.worker;
      const persistDir = path.join(stateDir, "wrangler", "worker");
      await mkdir(persistDir, { recursive: true });
      children.push(spawnService(
        "worker-stack",
        process.execPath,
        [path.join(adapterDir, "scripts", "dev-stack.mjs"), "--worker-only"],
        {
          cwd: adapterDir,
          logFile: path.join(logDir, "worker-stack.log"),
          env: {
            ...env,
            ZILOBASE_APP_DIR: coreDir,
            ZILOBASE_WRANGLER_PERSIST_DIR: persistDir,
            ZILOBASE_ADAPTER_PORT: String(profile.apiPort),
            ZILOBASE_BACKGROUND_PORT: String(profile.backgroundPort),
            ZILOBASE_INSPECTOR_PORT: String(profile.inspectorPort),
            ZILOBASE_BACKGROUND_INSPECTOR_PORT: String(profile.backgroundInspectorPort),
          },
        },
        color++,
      ));
      children.push(spawnWeb(
        "worker-web",
        profile,
        {
          ...env,
          ZILOBASE_WEB_AI_CONVERSATION_MODULE: path.join(
            adapterDir,
            "src/web/use-agent-conversation.ts",
          ),
          ZILOBASE_WEB_ADAPTER_WEBSOCKET_PATHS: "/agents",
        },
        color++,
      ));
    }

    await mkdir(stateDir, { recursive: true });
    await writeFile(runtimeStateFile, `${JSON.stringify({
      profiles: Object.fromEntries(names.map((name) => [name, profiles[name]])),
      pids: children.map((child) => child.pid).filter(Boolean),
      startedAt: new Date().toISOString(),
    }, null, 2)}\n`, { mode: 0o600 });

    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
      process.once(signal, () => void stop(signal));
    }
    process.once("exit", () => rmSync(runtimeStateFile, { force: true }));

    await waitForRuntimeReadiness(names, profiles, children);
    printLocalSummary(names, profiles);

    const result = await Promise.race(children.map((child) => new Promise((resolve) => {
      child.once("error", (error) => resolve({ error }));
      child.once("exit", (code, signal) => resolve({ code, signal }));
    })));
    if (!stopping && result.error) throw result.error;
    if (!stopping && result.code !== 0) {
      throw new Error(`Development process exited with ${result.signal ?? result.code}.`);
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
    console.info("No runtime logs yet. Start npm run dev:local first.");
    return;
  }
  const offsets = new Map();
  for (const filename of files) {
    const content = await readFile(filename, "utf8");
    const lines = content.trimEnd().split("\n");
    console.info(lines.slice(-200).join("\n"));
    offsets.set(filename, Buffer.byteLength(content));
  }
  console.info("\nFollowing runtime logs. Press Ctrl-C to stop. Dependency logs: docker compose -f scripts/dev/dependencies.compose.yml logs -f");
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
  if (!["node", "worker", "community", "all"].includes(target)) {
    throw new Error("Reset target must be node, worker, community, or all.");
  }
  if (!confirmed) {
    throw new Error(`Reset deletes ${target} development data. Re-run with --yes to confirm.`);
  }
  await stopRuntimeProcesses();
  await ensureDevelopmentEnvironment();

  if (target === "all") {
    await dependencies(["down", "--volumes", "--remove-orphans"]);
    await rm(path.join(stateDir, "wrangler"), { force: true, recursive: true });
    const kind = runResult("kind", ["delete", "cluster", "--name", kindCluster]);
    if (kind.status !== 0 && kind.error?.code !== "ENOENT") process.stderr.write(kind.stderr ?? "");
    console.info("All local runtime data was removed.");
    return;
  }

  if (target === "node" || target === "worker") {
    await dependencies(["up", "-d", "postgres", "minio", "mailpit", "--wait"]);
    await dependencies(["run", "--rm", "-T", "minio-init"]);
    await recreateDatabase(localProfiles[target].database);
    if (target === "node") await resetNodeBucket();
    if (target === "worker") {
      await rm(path.join(stateDir, "wrangler", "worker"), { force: true, recursive: true });
    }
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
        VITE_API_URL: process.env.VITE_API_URL ?? apiUrl(profile),
        VITE_DEV_HOST: "0.0.0.0",
        VITE_DEV_PORT: String(profile.appPort),
      },
    },
    color,
  );
}

async function dependencies(args, options = {}) {
  const env = await loadGeneratedEnvironment(generatedEnvironmentFiles.dependencies);
  const commandArgs = [
    "compose",
    "--project-name",
    composeProject,
    "--env-file",
    generatedEnvironmentFiles.dependencies,
    "-f",
    composeFile,
    ...args,
  ];
  if (options.reject === false) return runResult("docker", commandArgs, { cwd: coreDir, env: { ...process.env, ...env } });
  return run("docker", commandArgs, { cwd: coreDir, env: { ...process.env, ...env } });
}

async function recreateDatabase(database) {
  const env = await loadGeneratedEnvironment(generatedEnvironmentFiles.dependencies);
  const sql = `DROP DATABASE IF EXISTS ${database} WITH (FORCE); CREATE DATABASE ${database};`;
  await dependencies([
    "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1",
    "-U", env.POSTGRES_USER, "-d", "postgres", "-c", sql,
  ]);
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
    if (!/(serverful\.ts|dev-stack\.mjs|vite(?:\.js)?)/.test(result.stdout)) {
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

export function effectiveProfile(name, env) {
  const profile = { ...localProfiles[name] };
  if (name === "node") {
    profile.apiPort = readPort(env.PORT, profile.apiPort);
    profile.healthPort = readPort(env.BACKGROUND_HEALTH_PORT, profile.healthPort);
    profile.appPort = readPort(env.ZILOBASE_NODE_WEB_PORT, profile.appPort);
    profile.inspectorPort = readPort(
      env.ZILOBASE_NODE_INSPECTOR_PORT,
      profile.inspectorPort,
    );
  } else {
    profile.apiPort = readPort(env.ZILOBASE_ADAPTER_PORT, profile.apiPort);
    profile.backgroundPort = readPort(env.ZILOBASE_BACKGROUND_PORT, profile.backgroundPort);
    profile.appPort = readPort(env.ZILOBASE_WORKER_WEB_PORT, profile.appPort);
    profile.inspectorPort = readPort(env.ZILOBASE_INSPECTOR_PORT, profile.inspectorPort);
    profile.backgroundInspectorPort = readPort(
      env.ZILOBASE_BACKGROUND_INSPECTOR_PORT,
      profile.backgroundInspectorPort,
    );
  }
  return profile;
}

function runtimeEnvironment(profile, env) {
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
