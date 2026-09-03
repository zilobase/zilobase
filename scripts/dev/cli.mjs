#!/usr/bin/env node
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { coreDir } from "./config.mjs";
import { doctor } from "./doctor.mjs";
import {
  checkEnvironment,
  ensureDevelopmentEnvironment,
  environmentFilesForEncryption,
} from "./env.mjs";
import {
  followDependencyLogs,
  followLocalLogs,
  resetLocal,
  showStatus,
  startLocal,
  stopLocal,
} from "./local.mjs";
import { testRuntimeParity } from "./parity.mjs";
import {
  followKubernetesLogs,
  rebuildKubernetes,
  smokeKubernetes,
  startKubernetes,
  stopKubernetes,
} from "./k8s.mjs";

const command = process.argv[2];
const args = process.argv.slice(3);

try {
  if (command === "doctor") await doctor();
  else if (command === "setup") {
    await ensureDevelopmentEnvironment({ reportLegacy: true });
    await printEnvironmentCheck();
  } else if (command === "env-check") await printEnvironmentCheck();
  else if (command === "env-encrypt") await runDotenvx("encrypt");
  else if (command === "env-decrypt") await runDotenvx("decrypt");
  else if (command === "local") await startLocal(readOption(args, "--target") ?? "all");
  else if (command === "status") await showStatus();
  else if (command === "logs") await followLocalLogs();
  else if (command === "down") await stopLocal();
  else if (command === "reset") {
    await resetLocal(readOption(args, "--target") ?? "all", args.includes("--yes"));
  } else if (command === "parity") {
    await testRuntimeParity(readOption(args, "--target") ?? "all");
  }
  else if (command === "k8s") await startKubernetes(readOption(args, "--target") ?? "community");
  else if (command === "k8s-rebuild") await rebuildKubernetes(readOption(args, "--target"));
  else if (command === "k8s-logs") await followKubernetesLogs(readOption(args, "--target") ?? "community");
  else if (command === "k8s-down") await stopKubernetes();
  else if (command === "k8s-smoke") await smokeKubernetes(readOption(args, "--target") ?? "community");
  else throw new Error(`Unknown development command: ${command ?? "(missing)"}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function printEnvironmentCheck() {
  const results = await checkEnvironment();
  for (const result of results) {
    if (result.missing.length) {
      console.info(`✗ ${result.name}: missing ${result.missing.join(", ")}`);
    } else {
      console.info(`✓ ${result.name}: required environment is configured`);
    }
  }
  if (results.some((result) => result.missing.length)) {
    throw new Error("Development environment validation failed.");
  }
}

async function runDotenvx(action) {
  await ensureDevelopmentEnvironment();
  const files = environmentFilesForEncryption();
  for (const file of files) {
    if (action === "decrypt") {
      const plaintext = await captureDotenvx(["decrypt", "--stdout", "-f", file.filename]);
      await mkdir(path.dirname(file.plaintext), { recursive: true });
      await writeFile(file.plaintext, plaintext, { mode: 0o600 });
      await chmod(file.plaintext, 0o600);
      console.info(`Decrypted ${file.name} into ignored private state: ${path.relative(coreDir, file.plaintext)}`);
      continue;
    }

    const hasPlaintext = await exists(file.plaintext);
    const encryptedBackup = hasPlaintext ? await readFile(file.filename) : null;
    if (hasPlaintext) {
      await copyFile(file.plaintext, file.filename);
      await chmod(file.filename, 0o600);
    }
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(
          path.join(coreDir, "node_modules", ".bin", "dotenvx"),
          [action, "-f", file.filename],
          { cwd: coreDir, stdio: "inherit" },
        );
        child.once("error", reject);
        child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`dotenvx ${action} failed.`)));
      });
    } catch (error) {
      if (encryptedBackup) await writeFile(file.filename, encryptedBackup, { mode: 0o600 });
      throw error;
    }
    if (hasPlaintext) await rm(file.plaintext, { force: true });
  }
}

function captureDotenvx(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(coreDir, "node_modules", ".bin", "dotenvx"), args, {
      cwd: coreDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.resume();
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve(Buffer.concat(stdout).toString("utf8"));
      else reject(new Error("dotenvx decrypt failed; verify the matching private key is available."));
    });
  });
}

async function exists(filename) {
  try {
    await access(filename, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function readOption(values, option) {
  const index = values.indexOf(option);
  return index === -1 ? null : values[index + 1];
}
