import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { config as loadDotenvx, parse } from "@dotenvx/dotenvx";

import { coreDir, localProfiles } from "./config.mjs";
import { createFromTemplateIfMissing } from "./env.mjs";
import { effectiveProfile, resetLocal } from "./local.mjs";
import { assertPortsAvailable, redact, stopChildren } from "./process.mjs";

test("runtime profiles have isolated ports, databases, and identities", () => {
  const node = localProfiles.node;
  const worker = localProfiles.worker;
  const ports = [
    node.appPort,
    node.apiPort,
    node.healthPort,
    node.inspectorPort,
    worker.appPort,
    worker.apiPort,
    worker.backgroundPort,
    worker.inspectorPort,
    worker.backgroundInspectorPort,
  ];
  assert.equal(new Set(ports).size, ports.length);
  assert.notEqual(node.database, worker.database);
  assert.notEqual(node.cellId, worker.cellId);
  assert.equal(node.appHost, "localhost");
  assert.equal(node.apiHost, "localhost");
  assert.equal(worker.appHost, "127.0.0.1");
  assert.equal(worker.apiHost, "127.0.0.1");
  assert.notEqual(node.appHost, worker.appHost);
});

test("shell profile overrides select validated ports", () => {
  const profile = effectiveProfile("worker", {
    ZILOBASE_ADAPTER_PORT: "4010",
    ZILOBASE_BACKGROUND_PORT: "4012",
    ZILOBASE_WORKER_WEB_PORT: "4020",
    ZILOBASE_INSPECTOR_PORT: "4031",
    ZILOBASE_BACKGROUND_INSPECTOR_PORT: "4032",
  });
  assert.deepEqual(
    [
      profile.apiPort,
      profile.backgroundPort,
      profile.appPort,
      profile.inspectorPort,
      profile.backgroundInspectorPort,
    ],
    [4010, 4012, 4020, 4031, 4032],
  );
  assert.equal(effectiveProfile("node", { PORT: "invalid" }).apiPort, 3000);
});

test("dotenvx loads a runtime file while invoking environment wins", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "zilobase-env-test-"));
  const filename = path.join(directory, ".env.development");
  await writeFile(filename, "FROM_FILE=yes\nSHARED=file\n", { mode: 0o600 });
  const target = {};
  loadDotenvx({ path: filename, processEnv: target, quiet: true, noOps: true });
  const result = { ...target, ...{ SHARED: "shell" } };
  assert.equal(result.FROM_FILE, "yes");
  assert.equal(result.SHARED, "shell");
});

test("dotenvx programmatic loading decrypts encrypted runtime files", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "zilobase-encrypted-env-test-"));
  const filename = path.join(directory, ".env.development");
  await writeFile(filename, "ENCRYPTED_VALUE=available\n", { mode: 0o600 });
  const dotenvx = path.join(coreDir, "node_modules", ".bin", "dotenvx");
  const encrypted = spawnSync(dotenvx, ["encrypt", "-f", filename], {
    cwd: directory,
    encoding: "utf8",
  });
  assert.equal(encrypted.status, 0, encrypted.stderr);
  const keys = parse(await readFile(path.join(directory, ".env.keys"), "utf8"));
  const target = { ...keys };
  loadDotenvx({ path: filename, processEnv: target, quiet: true, noOps: true });
  assert.equal(target.ENCRYPTED_VALUE, "available");
});

test("setup creates private files once and never overwrites them", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "zilobase-template-test-"));
  const template = path.join(directory, "example");
  const destination = path.join(directory, "nested", ".env.development");
  await writeFile(template, "VALUE=first\n");
  assert.equal(await createFromTemplateIfMissing(template, destination), true);
  assert.equal((await stat(destination)).mode & 0o777, 0o600);
  await writeFile(template, "VALUE=second\n");
  assert.equal(await createFromTemplateIfMissing(template, destination), false);
  assert.equal(await readFile(destination, "utf8"), "VALUE=first\n");
});

test("diagnostics redact credentials and database URLs", () => {
  const output = redact(
    "password=hunter2 token: abc database=postgresql://user:pass@host/db api_key=xyz",
  );
  assert.doesNotMatch(output, /hunter2|abc|user:pass|xyz/);
  assert.match(output, /\[redacted\]/);
});

test("port collision detection rejects wildcard listeners", async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  await assert.rejects(() => assertPortsAvailable([address.port]), /already in use/);
  await new Promise((resolve) => server.close(resolve));
});

test("process cleanup terminates supervised children", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
  });
  await stopChildren([child]);
  assert.ok(child.exitCode !== null || child.signalCode !== null);
});

test("reset requires an explicit target confirmation", async () => {
  await assert.rejects(() => resetLocal("node", false), /--yes/);
  await assert.rejects(() => resetLocal("not-a-runtime", true), /target must be/);
});
