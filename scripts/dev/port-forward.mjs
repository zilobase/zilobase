#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);
let child;
let restartTimer;
let stopping = false;

start();

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => stop(signal));
}

function start() {
  child = spawn("kubectl", args, { stdio: "inherit" });
  child.once("error", (error) => {
    console.error(`Unable to start kubectl port-forward: ${error.message}`);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    if (stopping) {
      process.exit(code ?? (signal ? 1 : 0));
      return;
    }
    console.error(`Port-forward disconnected (${signal ?? code}); reconnecting…`);
    restartTimer = setTimeout(start, 500);
  });
}

function stop(signal) {
  if (stopping) return;
  stopping = true;
  if (restartTimer) clearTimeout(restartTimer);
  if (child?.exitCode === null && !child.killed) child.kill(signal);
  else process.exit(0);
}
