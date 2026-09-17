#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { run } from "../dev/process.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const zeroSha = /^0+$/;

// Path filters copy the pull_request `paths:` lists in .github/workflows.
// Self-host Compose, Community Helm, nightly desktop packaging, and release
// publishing stay off this hook: they need Docker/kind clusters and 45+ minutes.
export const jobs = [
  {
    id: "tokens",
    name: "Color tokens",
    workflow: "package.json verify:core",
    commit: true,
    paths: ["scripts/colors/**", "apps/web/**"],
    commands: [["npm", "run", "tokens:check"]],
  },
  {
    id: "tooling",
    name: "Tooling tests",
    workflow: "package.json verify:core",
    commit: true,
    paths: ["scripts/**", "package.json", "package-lock.json"],
    commands: [["npm", "run", "test:tooling"]],
  },
  {
    id: "community-boundary",
    name: "Community boundary",
    workflow: ".github/workflows/community-boundary.yml",
    commit: true,
    paths: null,
    commands: [["npm", "run", "test:community-boundary"]],
  },
  {
    id: "architecture",
    name: "Architecture links and published exports",
    workflow: "package.json verify:architecture",
    commit: true,
    paths: null,
    commands: [["npm", "run", "test:architecture"]],
  },
  {
    id: "web-and-packages",
    name: "Web and packages",
    workflow: ".github/workflows/web-and-packages.yml",
    paths: [
      "apps/web/**",
      "packages/**",
      "scripts/colors/**",
      "package.json",
      "package-lock.json",
      ".github/workflows/web-and-packages.yml",
    ],
    commands: [
      ["npm", "run", "typecheck"],
      ["npm", "run", "test:packages"],
      ["npm", "run", "test:web"],
      ["npm", "run", "build"],
    ],
  },
  {
    id: "desktop",
    name: "Desktop checks",
    workflow: ".github/workflows/desktop-checks.yml",
    paths: [
      "apps/desktop/**",
      "package.json",
      "package-lock.json",
      ".github/workflows/desktop-checks.yml",
    ],
    commands: [["npm", "run", "verify:desktop"]],
  },
];

export function pathMatches(file, pattern) {
  const normalized = file.replaceAll("\\", "/");
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  }
  return normalized === pattern;
}

export function jobApplies(job, files) {
  if (job.paths == null) return true;
  return files.some((file) => job.paths.some((pattern) => pathMatches(file, pattern)));
}

export function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    staged: argv.includes("--staged"),
    hook: argv.includes("--hook"),
  };
}

export function selectJobs(files, catalog = jobs, options = {}) {
  return catalog.filter((job) => {
    if (options.commit && !job.commit) return false;
    return jobApplies(job, files);
  });
}

export function selectedCommands(selected) {
  const seen = new Set();
  const commands = [];
  for (const job of selected) {
    for (const command of job.commands) {
      const key = command.join("\0");
      if (seen.has(key)) continue;
      seen.add(key);
      commands.push({ id: job.id, name: job.name, command });
    }
  }
  return commands;
}

export function parsePushRefs(stdin) {
  return stdin
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/);
      if (!localRef || !localSha || !remoteRef || !remoteSha) {
        throw new Error(`Malformed pre-push ref line: ${line}`);
      }
      return { localRef, localSha, remoteRef, remoteSha };
    });
}

export function isZeroSha(sha) {
  return zeroSha.test(sha);
}

export function shouldSkipHooks(env = process.env) {
  const value = env.ZILOBASE_SKIP_HOOKS;
  return value === "1" || value === "true" || value === "yes";
}

export function resolveBaseRef(git) {
  for (const ref of ["origin/main", "main", "origin/master", "master"]) {
    if (git(["rev-parse", "--verify", "--quiet", ref]).status === 0) return ref;
  }
  return null;
}

export function collectFilesFromPush(refs, { git, baseRef }) {
  const files = new Set();
  let pushingCommits = false;
  for (const ref of refs) {
    if (isZeroSha(ref.localSha)) continue;
    pushingCommits = true;
    for (const file of diffNames(git, baseRef, ref.localSha)) files.add(file);
  }
  return { files: [...files].sort(), pushingCommits };
}

export function collectFilesFromWorkingTree({ git, baseRef }) {
  const files = new Set(diffNames(git, baseRef, "HEAD"));
  for (const file of splitNames(git(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"]).stdout)) {
    files.add(file);
  }
  for (const file of splitNames(git(["diff", "--name-only", "--cached", "--diff-filter=ACMR"]).stdout)) {
    files.add(file);
  }
  for (const file of splitNames(git(["ls-files", "--others", "--exclude-standard"]).stdout)) {
    files.add(file);
  }
  return [...files].sort();
}

export function collectStagedFiles({ git }) {
  return splitNames(git(["diff", "--name-only", "--cached", "--diff-filter=ACMR"]).stdout);
}

function diffNames(git, baseRef, toSha) {
  if (!baseRef) return [];
  const threeDot = git(["diff", "--name-only", "--diff-filter=ACMR", `${baseRef}...${toSha}`]);
  if (threeDot.status === 0) return splitNames(threeDot.stdout);
  const twoDot = git(["diff", "--name-only", "--diff-filter=ACMR", `${baseRef}..${toSha}`]);
  if (twoDot.status === 0) return splitNames(twoDot.stdout);
  return [];
}

function splitNames(stdout) {
  return (stdout ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export async function runPushChecks({
  files,
  cwd = repoRoot,
  runCommand = run,
  log = console,
  commit = false,
  dryRun = false,
} = {}) {
  const selected = selectJobs(files, jobs, { commit });
  const commands = selectedCommands(selected);
  const gate = commit ? "commit" : "push";
  if (commands.length === 0) {
    log.info(`No GitHub PR checks apply to the files in this ${gate}.`);
    return selected;
  }

  log.info(`${dryRun ? "Would run" : "Running"} GitHub PR checks for this ${gate}:`);
  for (const job of selected) log.info(`  - ${job.name} (${job.workflow})`);
  if (!commit) {
    log.info("Not run here: self-host Compose, Community Helm, nightly desktop packaging, release publishing.");
  }
  log.info("Skip with git commit/push --no-verify or ZILOBASE_SKIP_HOOKS=1.");

  for (const { name, command } of commands) {
    log.info(`\n==> ${name}: ${command.join(" ")}`);
    if (!dryRun) await runCommand(command[0], command.slice(1), { cwd, stdio: "inherit" });
  }
  return selected;
}

export function collectFiles({ staged, hook, stdinText, git, baseRef }) {
  if (staged) {
    return { files: collectStagedFiles({ git }), pushingCommits: true };
  }
  if (hook) {
    const refs = parsePushRefs(stdinText ?? "");
    if (refs.length === 0) {
      return { files: collectFilesFromWorkingTree({ git, baseRef }), pushingCommits: true };
    }
    return collectFilesFromPush(refs, { git, baseRef });
  }
  return { files: collectFilesFromWorkingTree({ git, baseRef }), pushingCommits: true };
}

export async function main({
  stdinText,
  env = process.env,
  cwd = repoRoot,
  git = defaultGit,
  runCommand = run,
  log = console,
  hook = false,
  staged = false,
  dryRun = false,
} = {}) {
  if (shouldSkipHooks(env)) {
    log.info("Skipping GitHub PR checks (ZILOBASE_SKIP_HOOKS is set).");
    return { skipped: true, files: [], jobs: [] };
  }

  const gitAt = (args) => git(args, cwd);
  const baseRef = resolveBaseRef(gitAt);
  const { files, pushingCommits } = collectFiles({ staged, hook, stdinText, git: gitAt, baseRef });

  if (!pushingCommits) {
    log.info("Remote-only ref update; skipping GitHub PR checks.");
    return { skipped: true, files: [], jobs: [] };
  }

  if (!baseRef && !staged) {
    log.info("No origin/main (or main) ref found; running every local GitHub PR check.");
  }

  const selected = await runPushChecks({
    files: baseRef || staged ? files : ["package.json"],
    cwd,
    runCommand,
    log,
    commit: staged,
    dryRun,
  });
  return { skipped: false, files, jobs: selected };
}

function defaultGit(args, cwd = repoRoot) {
  return spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function readStdin() {
  if (process.stdin.isTTY) return "";
  return readFileSync(0, "utf8");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  main({
    stdinText: options.hook ? readStdin() : "",
    hook: options.hook,
    staged: options.staged,
    dryRun: options.dryRun,
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
