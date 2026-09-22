import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { _electron } from "playwright";

const executablePath = process.env.ZILOBASE_DESKTOP_BINARY;
assert.ok(executablePath, "ZILOBASE_DESKTOP_BINARY is required");
const version = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version;
const userData = await mkdtemp(path.join(os.tmpdir(), "zilobase-electron-oauth-"));
const browserUrlFile = path.join(userData, "e2e-browser-authorization-url");
const code = "E2E_OAUTH_CODE";
const token = "E2E_OAUTH_TOKEN_MUST_NOT_BE_LOGGED";
const instanceId = "electron-oauth-test";
let origin;
let authorizationUrl;
let exchangeError;
let exchanges = 0;
let desktop;

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/.well-known/zilobase") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        instanceId, displayName: "Electron OAuth test", issuer: origin,
        apiOrigin: origin, webOrigin: origin, protocolVersion: 1,
        serverVersion: version, minimumDesktopVersion: version,
        desktopAuthorization: {
          authorizationEndpoint: origin + "/desktop/authorize",
          tokenEndpoint: origin + "/api/auth/desktop/token",
        },
      }));
      return;
    }
    if (request.method === "POST" && request.url === "/api/auth/desktop/token") {
      const chunks = [];
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        assert.ok(length <= 16_384, "Token request is bounded");
        chunks.push(chunk);
      }
      const body = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
      assert.equal(body.get("client_id"), "zilobase-desktop");
      assert.equal(body.get("grant_type"), "authorization_code");
      assert.equal(body.get("code"), code);
      assert.equal(body.get("redirect_uri"), authorizationUrl.searchParams.get("redirect_uri"));
      assert.equal(createHash("sha256").update(body.get("code_verifier"), "ascii").digest("base64url"),
        authorizationUrl.searchParams.get("code_challenge"));
      exchanges++;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        access_token: token, token_type: "Bearer", issuer: origin,
        instance_id: instanceId, user: { id: "e2e-oauth-user" },
        expires_at: "2099-01-01T00:00:00.000Z",
      }));
      return;
    }
    response.writeHead(404).end("Not found.");
  } catch (error) {
    exchangeError = error;
    response.writeHead(400).end("Invalid exchange.");
  }
});

try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  desktop = await _electron.launch({
    executablePath,
    env: {
      ...process.env, ZILOBASE_E2E_USER_DATA: userData,
      ZILOBASE_E2E_CAPTURE_BROWSER_URL: "1",
    },
    timeout: 30_000,
  });
  const page = await desktop.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  const candidate = await page.evaluate((serverUrl) => window.zilobaseDesktop.server.prepare(serverUrl), origin);
  assert.equal(candidate.server.instanceId, instanceId);
  await page.evaluate((candidateId) => window.zilobaseDesktop.server.commit(candidateId), candidate.candidateId);
  await page.evaluate(() => {
    window.__electronOAuthResult = { phase: "pending" };
    void window.zilobaseDesktop.auth.startBrowser().then(
      (value) => { window.__electronOAuthResult = { phase: "complete", value }; },
      (error) => { window.__electronOAuthResult = { phase: "error", code: error.code }; },
    );
  });
  authorizationUrl = new URL(await waitForFile(browserUrlFile));
  assert.equal(authorizationUrl.origin, origin);
  assert.equal(authorizationUrl.pathname, "/desktop/authorize");
  assert.equal(authorizationUrl.searchParams.get("client_id"), "zilobase-desktop");
  assert.equal(authorizationUrl.searchParams.get("response_type"), "code");
  assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256");
  const redirectUri = authorizationUrl.searchParams.get("redirect_uri");
  assert.match(redirectUri, /^http:\/\/127\.0\.0\.1:\d+\/oauth\/callback$/);
  const state = authorizationUrl.searchParams.get("state");
  assert.ok(state && state.length >= 32);

  const invalid = new URL(redirectUri);
  invalid.searchParams.set("code", code);
  invalid.searchParams.set("state", "invalid-state");
  invalid.searchParams.set("iss", origin);
  assert.equal((await fetch(invalid, { redirect: "manual" })).status, 400);

  const callback = new URL(redirectUri);
  callback.searchParams.set("code", code);
  callback.searchParams.set("state", state);
  callback.searchParams.set("iss", origin);
  const accepted = await fetch(callback, { redirect: "manual" });
  assert.equal(accepted.status, 303);
  assert.equal(accepted.headers.get("location"), origin + "/desktop/connected");
  await page.waitForFunction(() => window.__electronOAuthResult?.phase !== "pending", null, { timeout: 15_000 });
  assert.deepEqual(await page.evaluate(() => window.__electronOAuthResult), {
    phase: "complete", value: { status: "success" },
  });
  assert.ifError(exchangeError);
  assert.equal(exchanges, 1);
  assert.equal(await page.evaluate(() => window.zilobaseDesktop.auth.getToken()), token);
  assert.equal(await page.evaluate(() => window.zilobaseDesktop.auth.getOwner()), "e2e-oauth-user");

  await unlink(browserUrlFile);
  await page.evaluate(() => {
    window.__electronOAuthResult = { phase: "pending" };
    void window.zilobaseDesktop.auth.startBrowser().then(
      (value) => { window.__electronOAuthResult = { phase: "complete", value }; },
      (error) => { window.__electronOAuthResult = { phase: "error", code: error.code }; },
    );
  });
  await waitForFile(browserUrlFile);
  const secondAttempt = await page.evaluate(async () => {
    try { await window.zilobaseDesktop.auth.startBrowser(); return { code: "unexpected_success" }; }
    catch (error) { return { code: error.code, message: error.message }; }
  });
  assert.equal(secondAttempt.code, "already_in_progress", JSON.stringify(secondAttempt));
  await page.evaluate(() => window.zilobaseDesktop.auth.cancelBrowser());
  await page.waitForFunction(() => window.__electronOAuthResult?.phase !== "pending", null, { timeout: 10_000 });
  assert.deepEqual(await page.evaluate(() => window.__electronOAuthResult), {
    phase: "error", code: "cancelled",
  });

  const archivePath = await page.evaluate(() => window.zilobaseDesktop.diagnostics.export());
  try {
    const entries = unzipSync(await readFile(archivePath));
    assert.ok(!Object.values(entries).some((entry) => Buffer.from(entry).includes(token)));
    assert.ok(!Object.values(entries).some((entry) => Buffer.from(entry).includes(code)));
  } finally { await unlink(archivePath); }
  console.info("Packaged Electron OAuth loopback, PKCE exchange, and encrypted session passed.");
} finally {
  if (desktop) await desktop.close().catch(() => undefined);
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(userData, { recursive: true, force: true });
}

async function waitForFile(file) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try { return await readFile(file, "utf8"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Electron did not create the browser authorization URL");
}
