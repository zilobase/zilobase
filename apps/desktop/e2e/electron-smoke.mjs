import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { _electron } from "playwright";

const executablePath = process.env.ZILOBASE_DESKTOP_BINARY;
assert.ok(executablePath, "ZILOBASE_DESKTOP_BINARY is required");
const userData = await mkdtemp(path.join(os.tmpdir(), "zilobase-electron-smoke-"));
let desktop;
try {
  desktop = await _electron.launch({
    executablePath,
    env: { ...process.env, ZILOBASE_E2E_USER_DATA: userData, ZILOBASE_E2E_DISABLE_LEGACY: "1" },
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
  const capture = await page.evaluate(() => window.zilobaseDesktop.capture.state());
  assert.equal(capture.phase, "idle");
  assert.deepEqual(await page.evaluate(() => window.zilobaseDesktop.capture.recoverable()), []);
  await assert.rejects(
    page.evaluate(() => window.zilobaseDesktop.capture.deleteLocal("../invalid")),
    /Invalid meeting identifier/,
  );
  await page.evaluate(() => window.zilobaseDesktop.auth.setToken("smoke-test-token"));
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
  } finally { await unlink(archivePath); }
  console.info("Packaged Electron renderer and preload loaded successfully.");
} finally {
  if (desktop) await desktop.close();
  await rm(userData, { recursive: true, force: true });
}
