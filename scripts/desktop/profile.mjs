#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";

import { coreDir, localProfiles, apiUrl } from "../dev/config.mjs";
import { loadProfileEnvironment } from "../dev/env.mjs";

const name = process.argv[2];
const profile = localProfiles[name];
if (!profile) {
  console.error("Usage: node scripts/desktop/profile.mjs <node|worker>");
  process.exit(1);
}

const env = await loadProfileEnvironment(name);
const desktopDir = path.join(coreDir, "apps", "desktop");
const child = spawn(
  "npm",
  ["run", "tauri", "--", "dev", "--config", `src-tauri/tauri.${name}.conf.json`],
  {
    cwd: desktopDir,
    env: { ...env, VITE_API_URL: apiUrl(profile) },
    stdio: "inherit",
  },
);
child.once("error", (error) => {
  console.error(error);
  process.exit(1);
});
child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
