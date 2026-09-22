import { spawn } from "node:child_process";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = new Set();
let stopping = false;

function start(script, workspace) {
  const child = spawn(npm, ["run", script, "--workspace", workspace], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

const web = start("dev", "@zilobase/web");
try {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (web.exitCode !== null) throw new Error("The web development server exited before Electron started.");
    try {
      const response = await fetch("http://localhost:1420/", { signal: AbortSignal.timeout(1_000) });
      if (response.ok) break;
    } catch { /* Wait for Vite to listen. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (Date.now() >= deadline) throw new Error("The web development server did not start on port 1420.");
  const electron = start("dev:electron", "@zilobase/desktop");
  web.once("exit", () => stop(1));
  electron.once("exit", (code) => stop(code ?? 1));
} catch (error) {
  console.error(error);
  stop(1);
}
