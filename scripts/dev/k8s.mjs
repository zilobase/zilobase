import { spawn } from "node:child_process";
import { constants, rmSync } from "node:fs";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  coreDir,
  generatedEnvironmentFiles,
  kindCluster,
  kubernetesProfiles,
  stateDir,
} from "./config.mjs";
import { ensureDevelopmentEnvironment, loadGeneratedEnvironment } from "./env.mjs";
import {
  assertPortsAvailable,
  run,
  runResult,
  runWithInput,
  spawnService,
  stopChildren,
  waitForUrl,
} from "./process.mjs";

const profile = kubernetesProfiles.community;
const dependencyManifest = path.join(coreDir, "scripts", "dev", "k8s-dependencies.yaml");
const k8sStateFile = path.join(stateDir, "k8s-runtime.json");
const dependencyImages = [
  "postgres:17.10-alpine",
  "minio/minio:RELEASE.2025-04-22T22-12-26Z",
  "minio/mc:RELEASE.2025-04-16T18-13-26Z",
  "axllent/mailpit:v1.27.8",
];

export async function startKubernetes(target = "community", options = {}) {
  assertCommunityTarget(target);
  await assertKubernetesTools();
  await ensureDevelopmentEnvironment();
  await stopPortForwards();
  await ensureKindCluster();
  await deployKubernetesProfile(options);
  await startPortForwards();
}

export async function rebuildKubernetes(target = "community") {
  assertCommunityTarget(target);
  await startKubernetes(target, { rebuild: true });
}

export async function followKubernetesLogs(target = "community") {
  assertCommunityTarget(target);
  await assertKubernetesTools();
  await run("kubectl", [
    "-n", profile.namespace, "logs", "--follow", "--prefix=true",
    "--all-containers=true", "--selector", `app.kubernetes.io/instance=${profile.release}`,
    "--tail", "200",
  ]);
}

export async function stopKubernetes() {
  await stopPortForwards();
  const result = runResult("kind", ["delete", "cluster", "--name", kindCluster]);
  if (result.error?.code === "ENOENT") throw new Error("kind is not installed.");
  if (result.status !== 0) throw new Error(result.stderr || "Unable to delete the kind cluster.");
}

export async function smokeKubernetes(target = "community") {
  assertCommunityTarget(target);
  await assertKubernetesTools();
  const ready = await fetch(`http://127.0.0.1:${profile.appPort}/ready`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!ready.ok || !(await ready.json()).ok) throw new Error("Community readiness failed.");
  const discovery = await fetch(
    `http://127.0.0.1:${profile.appPort}/.well-known/zilobase`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!discovery.ok) throw new Error(`Community discovery returned HTTP ${discovery.status}.`);
  const rollout = runResult("kubectl", [
    "-n", profile.namespace, "rollout", "status", deploymentName(), "--timeout=30s",
  ]);
  if (rollout.status !== 0) throw new Error(rollout.stderr || "Community rollout is not healthy.");
  const secrets = await loadGeneratedEnvironment(generatedEnvironmentFiles.kubernetes);
  const smokeState = path.join(stateDir, "k8s-community-smoke.json");
  const smokeScript = path.join(coreDir, "scripts", "selfhost", "test-community-helm.mjs");
  const env = {
    ...process.env,
    ZILOBASE_BOOTSTRAP_TOKEN: secrets.COMMUNITY_BOOTSTRAP_TOKEN,
    ZILOBASE_HELM_TEST_ORIGIN: `http://127.0.0.1:${profile.appPort}`,
    ZILOBASE_HELM_PUBLIC_ORIGIN: `http://${profile.appHost}:${profile.appPort}`,
    ZILOBASE_HELM_STATE_PATH: smokeState,
  };
  await run(process.execPath, [smokeScript, "seed"], { cwd: coreDir, env });
  await run("kubectl", ["-n", profile.namespace, "rollout", "restart", deploymentName()]);
  await run("kubectl", [
    "-n", profile.namespace, "rollout", "status", deploymentName(), "--timeout=5m",
  ]);
  await waitForUrl(`http://127.0.0.1:${profile.appPort}/ready`);
  await run(process.execPath, [smokeScript, "verify"], { cwd: coreDir, env });
  console.info("✓ community migration, bootstrap, CRUD, upload, WebSocket, and restart persistence smoke");
}

async function deployKubernetesProfile(options = {}) {
  const secrets = await loadGeneratedEnvironment(generatedEnvironmentFiles.kubernetes);
  await ensureNamespace(profile.namespace);
  await applySecret(profile.namespace, "zilobase-dev-infra", {
    POSTGRES_PASSWORD: secrets.COMMUNITY_POSTGRES_PASSWORD,
    MINIO_ROOT_PASSWORD: secrets.COMMUNITY_MINIO_PASSWORD,
  });
  await run("kubectl", [
    "-n", profile.namespace, "delete", "job", "minio-init", "--ignore-not-found=true",
  ]);
  await applyManifest(dependencyManifest, profile.namespace);
  await waitForDependencies(profile.namespace);
  const image = await buildAndLoad(options);
  await applySecret(profile.namespace, "zilobase", {
    DATABASE_URL:
      `postgresql://zilobase:${secrets.COMMUNITY_POSTGRES_PASSWORD}` +
      `@postgres.${profile.namespace}.svc.cluster.local:5432/zilobase`,
    BETTER_AUTH_SECRET: secrets.COMMUNITY_BETTER_AUTH_SECRET,
    ZILOBASE_BOOTSTRAP_TOKEN: secrets.COMMUNITY_BOOTSTRAP_TOKEN,
    S3_ACCESS_KEY_ID: "zilobase",
    S3_SECRET_ACCESS_KEY: secrets.COMMUNITY_MINIO_PASSWORD,
    SMTP_PASSWORD: "",
  });
  await helmDeploy(image);
}

async function buildAndLoad(options = {}) {
  const tag = "ghcr.io/zilobase/zilobase:local-kind";
  await buildWithCache(["--tag", tag, "."], options);
  const digest = imageDigest(tag);
  await loadKindImage(tag, `ghcr.io/zilobase/zilobase@${digest}`);
  return { digest, repository: "ghcr.io/zilobase/zilobase" };
}

async function helmDeploy(image) {
  await run("helm", [
    "upgrade", "--install", profile.release, path.join(coreDir, "deploy", "helm", "zilobase"),
    "--namespace", profile.namespace,
    "--set", `image.repository=${image.repository}`,
    "--set", `image.digest=${image.digest}`,
    "--set", "image.pullPolicy=Never",
    "--set", "development.enabled=true",
    "--set", "debug.enabled=true",
    "--set", "debug.port=9229",
    "--set", `config.externalUrl=http://${profile.appHost}:${profile.appPort}`,
    "--set", `config.s3Endpoint=http://minio.${profile.namespace}.svc.cluster.local:9000`,
    "--set", "config.s3PublicEndpoint=http://127.0.0.1:3210",
    "--set", "config.s3Bucket=zilobase",
    "--set", `config.smtpHost=mailpit.${profile.namespace}.svc.cluster.local`,
    "--set", "config.smtpPort=1025",
    "--set", "config.smtpSecure=false",
    "--set-string", "config.smtpUser=",
    "--set", "networkPolicy.enabled=false",
    "--timeout", "10m", "--wait",
  ], { cwd: coreDir });
}

async function startPortForwards() {
  await assertPortsAvailable([
    profile.appPort, profile.inspectorPort, profile.mailpitPort, 3210,
  ]);
  const children = [
    portForward("community-app", `service/${serviceName()}`, `${profile.appPort}:80`, 0),
    portForward("community-debug", deploymentName(), `${profile.inspectorPort}:9229`, 1),
    portForward("community-minio", "service/minio", "3210:9000", 2),
    portForward("community-mailpit", "service/mailpit", `${profile.mailpitPort}:8025`, 3),
  ];
  const firstExit = Promise.race(children.map(watchChildExit));
  await mkdir(stateDir, { recursive: true });
  await writeFile(k8sStateFile, `${JSON.stringify({
    pids: children.map((child) => child.pid).filter(Boolean),
    profiles: ["community"],
  }, null, 2)}\n`, { mode: 0o600 });
  let stopPromise;
  const stop = (signal = "SIGTERM") => {
    if (stopPromise) return stopPromise;
    rmSync(k8sStateFile, { force: true });
    stopPromise = stopChildren(children, signal);
    return stopPromise;
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.once(signal, () => void stop(signal));
  }
  process.once("exit", () => rmSync(k8sStateFile, { force: true }));
  await Promise.race([
    Promise.all([
      waitForUrl(`http://127.0.0.1:${profile.appPort}/ready`),
      waitForUrl("http://127.0.0.1:3210/minio/health/live"),
      waitForUrl(`http://127.0.0.1:${profile.mailpitPort}/api/v1/info`),
    ]),
    firstExit.then((result) => { throw childExitError(result); }),
  ]);
  console.info("\nCommunity Kubernetes development is ready:");
  console.info(`Community  http://${profile.appHost}:${profile.appPort}  inspector ${profile.inspectorPort}`);
  console.info(`${"".padEnd(10)} Mailpit http://127.0.0.1:${profile.mailpitPort}`);
  console.info("Ctrl-C stops port-forwards and preserves cluster data.\n");
  try {
    const result = await firstExit;
    if (result.error || result.code !== 0) throw childExitError(result);
  } finally {
    await stop();
  }
}

function watchChildExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    child.once("error", (error) => resolve({ error }));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

function childExitError(result) {
  return result.error ?? new Error(`Port-forward exited with ${result.signal ?? result.code}.`);
}

function portForward(name, resource, mapping, color) {
  return spawnService(name, process.execPath, [
    path.join(coreDir, "scripts", "dev", "port-forward.mjs"),
    "-n", profile.namespace, "port-forward", "--address", "127.0.0.1", resource, mapping,
  ], { cwd: coreDir, env: process.env }, color);
}

async function stopPortForwards() {
  let state;
  try { state = JSON.parse(await readFile(k8sStateFile, "utf8")); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  for (const pid of state?.pids ?? []) {
    if (!isRunningPid(pid)) continue;
    const result = runResult("ps", ["-p", String(pid), "-o", "command="]);
    if (!/kubectl.*port-forward/.test(result.stdout)) {
      console.warn(`Skipped PID ${pid}: it no longer belongs to a managed port-forward.`);
      continue;
    }
    try { process.kill(pid, "SIGTERM"); } catch (error) { if (error?.code !== "ESRCH") throw error; }
  }
  await rm(k8sStateFile, { force: true });
}

async function ensureKindCluster() {
  const clusters = runResult("kind", ["get", "clusters"]);
  if (clusters.status !== 0) throw new Error(clusters.stderr || "Unable to list kind clusters.");
  if (!clusters.stdout.split(/\s+/).includes(kindCluster)) {
    await run("kind", ["create", "cluster", "--name", kindCluster, "--wait", "5m"]);
  }
  await tuneKindInotifyLimit();
  for (const image of dependencyImages) {
    const inspect = runResult("docker", ["image", "inspect", image]);
    if (inspect.status !== 0) await run("docker", ["pull", image]);
    await loadKindImage(image);
  }
}

async function tuneKindInotifyLimit() {
  const nodes = runResult("kind", ["get", "nodes", "--name", kindCluster]);
  if (nodes.status !== 0) throw new Error(nodes.stderr || "Unable to list kind nodes.");
  for (const node of nodes.stdout.trim().split(/\s+/).filter(Boolean)) {
    await run("docker", [
      "exec", node, "sysctl", "-q", "-w", "fs.inotify.max_user_instances=8192",
    ]);
  }
}

async function ensureNamespace(namespace) {
  const result = runResult("kubectl", ["create", "namespace", namespace]);
  if (result.status !== 0 && !result.stderr.includes("AlreadyExists")) {
    throw new Error(result.stderr || `Unable to create namespace ${namespace}.`);
  }
}

async function applyManifest(filename, namespace) {
  const manifest = (await readFile(filename, "utf8")).replaceAll("__NAMESPACE__", namespace);
  await runWithInput("kubectl", ["apply", "-f", "-"], manifest, { cwd: coreDir });
}

async function applySecret(namespace, name, values) {
  const create = runResult("kubectl", [
    "-n", namespace, "create", "secret", "generic", name,
    ...Object.entries(values).map(([key, value]) => `--from-literal=${key}=${value}`),
    "--dry-run=client", "-o", "yaml",
  ]);
  if (create.status !== 0) throw new Error(create.stderr || `Unable to render secret ${name}.`);
  await runWithInput("kubectl", ["apply", "-f", "-"], create.stdout, { cwd: coreDir });
}

async function waitForDependencies(namespace) {
  for (const deployment of ["postgres", "minio", "mailpit"]) {
    await run("kubectl", [
      "-n", namespace, "rollout", "status", `deployment/${deployment}`, "--timeout=5m",
    ]);
  }
  await run("kubectl", [
    "-n", namespace, "wait", "--for=condition=complete", "job/minio-init", "--timeout=5m",
  ]);
}

async function buildWithCache(args, options = {}) {
  const cacheRoot = path.join(stateDir, "buildkit");
  const cache = path.join(cacheRoot, "community");
  const nextCache = path.join(cacheRoot, "community-next");
  await mkdir(cacheRoot, { recursive: true });
  await rm(nextCache, { force: true, recursive: true });
  const cacheFrom = await exists(cache) ? ["--cache-from", `type=local,src=${cache}`] : [];
  console.info(`${options.rebuild ? "Rebuilding" : "Building"} Community with BuildKit cache...`);
  await run("docker", [
    "buildx", "build", "--load", ...cacheFrom,
    "--cache-to", `type=local,dest=${nextCache},mode=max`, ...args,
  ], { cwd: coreDir, env: { ...process.env, BUILDKIT_PROGRESS: "plain" } });
  await rm(cache, { force: true, recursive: true });
  await rename(nextCache, cache);
}

function imageDigest(tag) {
  const result = runResult("docker", ["image", "inspect", tag, "--format", "{{.Id}}"]).stdout.trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(result)) throw new Error(`Unexpected image digest: ${result}`);
  return result;
}

async function loadKindImage(tag, digestTag) {
  const nodes = runResult("kind", ["get", "nodes", "--name", kindCluster]);
  if (nodes.status !== 0) throw new Error(nodes.stderr || "Unable to list kind nodes.");
  for (const node of nodes.stdout.trim().split(/\s+/).filter(Boolean)) {
    await streamImageIntoKindNode(tag, node);
    if (digestTag) {
      await run("docker", ["exec", node, "ctr", "-n", "k8s.io", "images", "tag", tag, digestTag]);
    }
  }
}

function streamImageIntoKindNode(tag, node) {
  return new Promise((resolve, reject) => {
    const save = spawn("docker", ["image", "save", tag], {
      cwd: coreDir, stdio: ["ignore", "pipe", "inherit"],
    });
    const load = spawn("docker", [
      "exec", "--interactive", node,
      "ctr", "--namespace=k8s.io", "images", "import", "--snapshotter=overlayfs", "-",
    ], { cwd: coreDir, stdio: ["pipe", "inherit", "inherit"] });
    save.stdout.pipe(load.stdin);
    let saveDone = false;
    let loadDone = false;
    const finish = () => { if (saveDone && loadDone) resolve(); };
    save.once("error", reject);
    load.once("error", reject);
    save.once("exit", (code, signal) => {
      if (code !== 0) reject(new Error(`docker image save failed with ${signal ?? code}`));
      else { saveDone = true; finish(); }
    });
    load.once("exit", (code, signal) => {
      if (code !== 0) reject(new Error(`containerd image import failed with ${signal ?? code}`));
      else { loadDone = true; finish(); }
    });
  });
}

function serviceName() {
  return "community-zilobase";
}

function deploymentName() {
  return `deployment/${serviceName()}`;
}

function assertCommunityTarget(target) {
  if (target !== "community") throw new Error("Kubernetes target must be community.");
}

async function assertKubernetesTools() {
  for (const [executable, args] of [
    ["docker", ["version"]],
    ["docker", ["buildx", "version"]],
    ["kubectl", ["version", "--client=true"]],
    ["kind", ["version"]],
    ["helm", ["version", "--short"]],
  ]) {
    const result = runResult(executable, args);
    if (result.status !== 0) throw new Error(`${executable} is required for Kubernetes development.`);
  }
}

async function exists(filename) {
  try { await access(filename, constants.F_OK); return true; } catch { return false; }
}

function isRunningPid(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if (error?.code === "ESRCH") return false;
    return error?.code === "EPERM";
  }
}
