#!/usr/bin/env node
import { spawn } from "node:child_process";

import { coreDir, localProfiles, apiUrl } from "../dev/config.mjs";
import { effectiveProfile, runtimeEnvironment } from "../dev/local.mjs";
import { loadProfileEnvironment } from "../dev/env.mjs";

const name = process.argv[2];
const profile = localProfiles[name];
if (!profile) {
  console.error("Usage: node scripts/desktop/profile.mjs <node|worker>");
  process.exit(1);
}

const loaded = await loadProfileEnvironment(name);
const env = runtimeEnvironment(effectiveProfile(name, loaded), loaded);
const child = spawn(
  "npm",
  ["run", "dev", "--workspace", "@zilobase/desktop"],
  {
    cwd: coreDir,
    env: { ...env, VITE_API_URL: env.VITE_API_URL ?? apiUrl(profile) },
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
