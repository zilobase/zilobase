import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { unzipSync } from "fflate";
import { _electron } from "playwright";

const executablePath = process.env.ZILOBASE_DESKTOP_BINARY;
assert.ok(executablePath, "ZILOBASE_DESKTOP_BINARY is required");
const userData = await mkdtemp(path.join(os.tmpdir(), "zilobase-electron-smoke-"));
let desktop;
try {
  desktop = await _electron.launch({
    executablePath,
    env: { ...process.env, ZILOBASE_E2E_USER_DATA: userData },
    timeout: 30_000,
  });
  desktop.process().stdout?.on("data", (chunk) => process.stdout.write(chunk));
  desktop.process().stderr?.on("data", (chunk) => process.stderr.write(chunk));
  const page = await desktop.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  const result = await page.evaluate(() => ({
    bridgeVersion: window.zilobaseDesktop?.apiVersion,
    origin: location.origin,
    title: document.title,
  }));
  assert.equal(result.bridgeVersion, 1);
  assert.equal(result.origin, "zilo-desktop://app");
  assert.ok(result.title);
  const server = await page.evaluate(() => window.zilobaseDesktop.server.initialize());
  assert.equal(server.apiOrigin, "https://api.zilobase.com");
  const profiles = await page.evaluate(() => window.zilobaseDesktop.server.list());
  assert.equal(profiles.activeInstanceId, server.instanceId);
  assert.equal(profiles.profiles.length, 1);
  await page.evaluate(() => window.zilobaseDesktop.server.updateSnapshot({
    workspaces: [{ id: "smoke-workspace", name: "Smoke workspace" }],
    lastActiveWorkspaceId: "smoke-workspace", lastPath: "/notes",
  }));
  const updated = await page.evaluate(() => window.zilobaseDesktop.server.list());
  assert.equal(updated.profiles[0].lastPath, "/notes");
  assert.equal(updated.profiles[0].workspaces[0].id, "smoke-workspace");
  await page.evaluate(() => {
    window.__electronSmokeLink = null;
    window.zilobaseDesktop.deepLinks.onOpen((links) => { window.__electronSmokeLink = links[0]; });
  });
  await page.evaluate(() => window.zilobaseDesktop.diagnostics.rendererReady(0));
  await promisify(execFile)(executablePath, [
    "zilobase://open?instance=zilobase-cloud&server=https%3A%2F%2Fapi.zilobase.com&path=%2Frecents%3Fprivate%3DSMOKE_LINK_SECRET",
  ], {
    env: { ...process.env, ZILOBASE_E2E_USER_DATA: userData },
    timeout: 15_000,
  });
  await page.waitForFunction(() => window.__electronSmokeLink?.type === "open", null, { timeout: 10_000 });
  assert.deepEqual(await page.evaluate(() => window.__electronSmokeLink), {
    type: "open", serverUrl: "https://api.zilobase.com", instanceId: "zilobase-cloud", path: "/recents?private=SMOKE_LINK_SECRET",
  });
  const capture = await page.evaluate(() => window.zilobaseDesktop.capture.state());
  assert.equal(capture.phase, "idle");
  assert.deepEqual(await page.evaluate(() => window.zilobaseDesktop.capture.recoverable()), []);
  const invalidStart = await page.evaluate(async () => {
    try { await window.zilobaseDesktop.capture.start({ meetingId: "../invalid" }); return null; }
    catch (error) { return { code: error.code, message: error.message }; }
  });
  assert.equal(invalidStart?.code, "invalid_argument");
  assert.match(invalidStart.message, /meeting capture configuration is invalid/i);
  const invalidLocal = await page.evaluate(async () => {
    try { await window.zilobaseDesktop.capture.deleteLocal("../invalid"); return null; }
    catch (error) { return { code: error.code, message: error.message }; }
  });
  assert.equal(invalidLocal?.code, "capture_failed");
  assert.match(invalidLocal.message, /Invalid meeting identifier/);
  const tokenWriteError = await page.evaluate(async () => {
    try { await window.zilobaseDesktop.auth.setToken("smoke-test-token"); return null; }
    catch (error) { return { code: error.code, message: error.message }; }
  });
  assert.equal(tokenWriteError, null, JSON.stringify(tokenWriteError));
  assert.equal(await page.evaluate(() => window.zilobaseDesktop.auth.getToken()), "smoke-test-token");
  await page.evaluate(() => window.zilobaseDesktop.auth.setToken(null));
  await page.evaluate(() => window.zilobaseDesktop.diagnostics.record("smoke.redaction", {
    status: "success", token: "SMOKE_SECRET_MUST_NOT_APPEAR",
  }, "info"));
  const archivePath = await page.evaluate(() => window.zilobaseDesktop.diagnostics.export());
  try {
    const entries = unzipSync(await readFile(archivePath));
    assert.ok(entries["diagnostics.json"]);
    assert.ok(!Object.values(entries).some((entry) => Buffer.from(entry).includes("SMOKE_SECRET_MUST_NOT_APPEAR")));
    assert.ok(!Object.values(entries).some((entry) => Buffer.from(entry).includes("SMOKE_LINK_SECRET")));
  } finally { await unlink(archivePath); }
  await desktop.close();
  desktop = null;
  const { stdout } = await promisify(execFile)(executablePath, ["--diagnostics"], {
    cwd: userData,
    env: { ...process.env, ZILOBASE_E2E_USER_DATA: userData },
    timeout: 15_000,
  });
  const cliArchive = stdout.trim().split(/\r?\n/).find((line) =>
    line.includes("zilobase-diagnostics-") && line.endsWith(".zip"));
  assert.ok(cliArchive, "CLI diagnostics returned an archive path");
  assert.equal(await realpath(path.dirname(cliArchive)), await realpath(userData));
  const cliEntries = unzipSync(await readFile(cliArchive));
  assert.ok(cliEntries["diagnostics.json"]);
  assert.ok(Object.keys(cliEntries).some((entry) => entry.startsWith("logs/")));
  console.info("Packaged Electron renderer and preload loaded successfully.");
} finally {
  if (desktop) await desktop.close();
  await rm(userData, { recursive: true, force: true });
}
