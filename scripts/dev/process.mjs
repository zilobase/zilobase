import { spawn, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { createServer } from "node:net";
import readline from "node:readline";

const colors = ["\u001b[36m", "\u001b[35m", "\u001b[33m", "\u001b[32m", "\u001b[34m"];
const reset = "\u001b[0m";

export function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { ...options, stdio: options.stdio ?? "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve({ code, signal });
      else reject(new Error(`${executable} exited with ${signal ?? code}`));
    });
  });
}

export function runResult(executable, args, options = {}) {
  return spawnSync(executable, args, {
    ...options,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
}

export function runWithInput(executable, args, input, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      ...options,
      stdio: ["pipe", options.stdout ?? "inherit", options.stderr ?? "inherit"],
    });
    child.once("error", reject);
    child.stdin.end(input);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve({ code, signal });
      else reject(new Error(`${executable} exited with ${signal ?? code}`));
    });
  });
}

export function spawnService(name, executable, args, options = {}, colorIndex = 0) {
  const { logFile, ...spawnOptions } = options;
  const child = spawn(executable, args, {
    ...spawnOptions,
    env: spawnOptions.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = logFile ? createWriteStream(logFile, { flags: "a", mode: 0o600 }) : null;
  pipeLines(child.stdout, name, process.stdout, colors[colorIndex % colors.length], log);
  pipeLines(child.stderr, name, process.stderr, colors[colorIndex % colors.length], log);
  child.once("close", () => log?.end());
  return child;
}

export async function assertPortsAvailable(ports) {
  const unavailable = [];
  for (const port of ports) {
    if (!(await isPortAvailable(port))) unavailable.push(port);
  }
  if (unavailable.length) {
    throw new Error(`Ports already in use: ${unavailable.join(", ")}. Run npm run dev:status for details.`);
  }
}

export async function waitForUrl(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 90_000;
  const deadline = Date.now() + timeoutMs;
  let lastError = "not reachable";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return response;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

export async function stopChildren(children, signal = "SIGTERM") {
  const live = children.filter((child) => child && child.exitCode === null && !child.killed);
  for (const child of live) child.kill(signal);
  await Promise.all(live.map((child) => new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  })));
}

function pipeLines(stream, name, target, color, log) {
  if (!stream) return;
  const reader = readline.createInterface({ input: stream });
  reader.on("line", (line) => {
    const safe = redact(line);
    target.write(`${color}[${name}]${reset} ${safe}\n`);
    log?.write(`[${new Date().toISOString()}] [${name}] ${safe}\n`);
  });
}

export function redact(line) {
  return line
    .replace(
      /(password|secret|token|api[_-]?key)(["']?\s*[:=]\s*["']?)([^\s,;}"]+)/gi,
      "$1$2[redacted]",
    )
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://[redacted]");
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    // Match the wildcard listeners used by Vite, Node, and Wrangler. On macOS a
    // loopback-only probe can coexist briefly with an existing wildcard socket,
    // which would produce a false "available" result.
    server.listen({ host: "0.0.0.0", port }, () => {
      server.close(() => resolve(true));
    });
  });
}
