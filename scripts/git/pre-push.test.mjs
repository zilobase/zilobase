import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { installGitHooks, hooksPath } from "./install-hooks.mjs";
import {
  collectFilesFromPush,
  isZeroSha,
  jobApplies,
  parseArgs,
  parsePushRefs,
  pathMatches,
  selectJobs,
  selectedCommands,
  shouldSkipHooks,
  jobs,
  main,
} from "./pre-push.mjs";

const zero = "0".repeat(40);
const sha = "a".repeat(40);

test("GitHub glob prefixes match files the way workflow paths: lists do", () => {
  assert.equal(pathMatches("apps/web/src/app.tsx", "apps/web/**"), true);
  assert.equal(pathMatches("apps/web", "apps/web/**"), true);
  assert.equal(pathMatches("apps/server/src/app.ts", "apps/web/**"), false);
  assert.equal(pathMatches("package.json", "package.json"), true);
  assert.equal(pathMatches("apps/web/package.json", "package.json"), false);
});

test("docs-only changes still run always-on GitHub PR jobs", () => {
  const selected = selectJobs(["docs/development-workflows.md", "CONTRIBUTING.md"]);
  assert.deepEqual(
    selected.map((job) => job.id),
    ["community-boundary", "architecture"],
  );
});

test("commit gate keeps cheap checks and skips web and desktop suites", () => {
  const selected = selectJobs(["package.json"], jobs, { commit: true });
  assert.deepEqual(
    selected.map((job) => job.id).sort(),
    ["architecture", "community-boundary", "tooling"],
  );
});

test("parseArgs recognizes hook, staged, and dry-run flags", () => {
  assert.deepEqual(parseArgs(["--hook", "--dry-run"]), {
    dryRun: true,
    staged: false,
    hook: true,
  });
  assert.deepEqual(parseArgs(["--staged"]), {
    dryRun: false,
    staged: true,
    hook: false,
  });
});

test("web paths select the web-and-packages workflow commands", () => {
  const selected = selectJobs(["apps/web/src/features/pages/Page.tsx"]);
  assert.ok(selected.some((job) => job.id === "web-and-packages"));
  assert.ok(selected.some((job) => job.id === "tokens"));
  assert.equal(selected.some((job) => job.id === "desktop"), false);
  assert.equal(selected.some((job) => job.id === "backend"), false);
});

test("server paths skip the web and desktop suites", () => {
  const selected = selectJobs(["apps/server/src/features/pages/routes.ts"]);
  assert.ok(selected.some((job) => job.id === "architecture"));
  assert.equal(selected.some((job) => job.id === "web-and-packages"), false);
  assert.equal(selected.some((job) => job.id === "desktop"), false);
});

test("desktop paths select cargo fmt, clippy, and tests", () => {
  const selected = selectJobs(["apps/desktop/electron/sidecar/src/main.rs"]);
  assert.ok(selected.some((job) => job.id === "desktop"));
  assert.equal(selected.some((job) => job.id === "web-and-packages"), false);
});

test("package.json matches every path-filtered GitHub workflow", () => {
  const selected = selectJobs(["package.json"]);
  assert.deepEqual(
    selected.map((job) => job.id).sort(),
    [
      "architecture",
      "community-boundary",
      "desktop",
      "tooling",
      "web-and-packages",
    ],
  );
});

test("selected commands drop duplicates when two jobs share a script", () => {
  const commands = selectedCommands([
    { id: "a", name: "A", commands: [["npm", "run", "test:server"]] },
    { id: "b", name: "B", commands: [["npm", "run", "test:server"], ["npm", "run", "typecheck"]] },
  ]);
  assert.deepEqual(
    commands.map((entry) => entry.command.join(" ")),
    ["npm run test:server", "npm run typecheck"],
  );
});

test("pre-push stdin parsing ignores remote deletes and collects local tips", () => {
  const refs = parsePushRefs(
    `refs/heads/feature ${sha} refs/heads/feature ${zero}\nrefs/heads/gone ${zero} refs/heads/gone ${sha}\n`,
  );
  assert.equal(refs.length, 2);
  assert.equal(isZeroSha(refs[1].localSha), true);
  const gitCalls = [];
  const git = (args) => {
    gitCalls.push(args);
    return { status: 0, stdout: "apps/web/src/app.tsx\n" };
  };
  const collected = collectFilesFromPush(refs, { git, baseRef: "origin/main" });
  assert.equal(collected.pushingCommits, true);
  assert.deepEqual(collected.files, ["apps/web/src/app.tsx"]);
  assert.equal(
    gitCalls.some((args) => args.includes(`origin/main...${sha}`)),
    true,
  );
});

test("skip env and delete-only pushes do not run commands", async () => {
  assert.equal(shouldSkipHooks({ ZILOBASE_SKIP_HOOKS: "1" }), true);
  const ran = [];
  const skipped = await main({
    env: { ZILOBASE_SKIP_HOOKS: "true" },
    hook: true,
    stdinText: `refs/heads/feature ${sha} refs/heads/feature ${zero}`,
    runCommand: async (executable, args) => {
      ran.push([executable, ...args]);
    },
    log: { info() {} },
    git: () => ({ status: 0, stdout: "" }),
  });
  assert.equal(skipped.skipped, true);
  assert.deepEqual(ran, []);

  const deleted = await main({
    env: {},
    hook: true,
    stdinText: `refs/heads/gone ${zero} refs/heads/gone ${sha}`,
    runCommand: async (executable, args) => {
      ran.push([executable, ...args]);
    },
    log: { info() {} },
    git: () => ({ status: 0, stdout: "" }),
  });
  assert.equal(deleted.skipped, true);
  assert.deepEqual(ran, []);
});

test("dry-run lists commands without executing them", async () => {
  const ran = [];
  const result = await main({
    env: {},
    staged: true,
    dryRun: true,
    runCommand: async (executable, args) => {
      ran.push([executable, ...args]);
    },
    log: { info() {} },
    git: (args) => ({
      status: 0,
      stdout: args.includes("--cached") ? "CONTRIBUTING.md\n" : "",
    }),
  });
  assert.equal(result.skipped, false);
  assert.deepEqual(result.jobs.map((job) => job.id), ["community-boundary", "architecture"]);
  assert.deepEqual(ran, []);
});

test("hook install sets core.hooksPath in an isolated repository", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "zilobase-hooks-"));
  const hookDir = path.join(root, hooksPath);
  await mkdir(hookDir);
  await writeFile(path.join(hookDir, "pre-commit"), "#!/bin/sh\nexit 0\n");
  await writeFile(path.join(hookDir, "pre-push"), "#!/bin/sh\nexit 0\n");
  const init = spawnSync("git", ["init"], { cwd: root, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  const messages = [];
  await installGitHooks({ cwd: root, log: { info: (message) => messages.push(message) } });
  const configured = spawnSync("git", ["config", "--get", "core.hooksPath"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(configured.status, 0, configured.stderr);
  assert.equal(configured.stdout.trim(), hooksPath);
  assert.match(messages.join("\n"), /Git commit and push hooks installed/);
  await chmod(path.join(hookDir, "pre-push"), 0o755);
});

test("every catalog job points at an existing workflow or verify:core", () => {
  const script = fileURLToPath(new URL("./pre-push.mjs", import.meta.url));
  assert.equal(path.basename(script), "pre-push.mjs");
  for (const job of jobs) {
    assert.ok(job.commands.length > 0, job.id);
    assert.ok(job.workflow.includes(".yml") || job.workflow.includes("package.json"), job.id);
  }
  assert.equal(jobApplies(jobs.find((job) => job.id === "community-boundary"), []), true);
});
