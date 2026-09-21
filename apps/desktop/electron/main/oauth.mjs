import { shell } from "electron";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { activeServer, desktopError, loadConfig } from "./server.mjs";
import { credentials } from "./credentials.mjs";

let activeAttempt = null;
let authorizationInProgress = false;
const base64url = (bytes) => Buffer.from(bytes).toString("base64url");

function matches(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function oneParameter(params, name) {
  const values = params.getAll(name);
  return values.length === 1 ? values[0] : null;
}

async function bindLoopback(handler) {
  for (const host of ["127.0.0.1", "::1"]) {
    const server = createServer({ maxHeaderSize: 8192 }, handler);
    server.requestTimeout = 5_000;
    server.headersTimeout = 5_000;
    server.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"));
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, host, resolve);
      });
      return { server, redirectUri: `http://${host === "::1" ? "[::1]" : host}:${server.address().port}/oauth/callback` };
    } catch {
      server.close();
    }
  }
  throw desktopError("callback_rejected", "The local sign-in callback could not start.");
}

async function readBoundedJson(response) {
  if (!response.ok || Number(response.headers.get("content-length") || 0) > 65_536) {
    throw desktopError("token_exchange_failed", "The server rejected the authorization code.");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 65_536) throw desktopError("token_exchange_failed", "The token response is too large.");
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw desktopError("token_exchange_failed", "The token response is invalid."); }
}

async function authorize(focusWindow) {
  const attempt = { controller: new AbortController(), server: null, rejectCallback: null, cancelled: false };
  activeAttempt = attempt;
  const selected = activeServer(await loadConfig());
  if (attempt.cancelled) throw desktopError("cancelled", "Browser sign-in was cancelled.");
  const state = base64url(randomBytes(32));
  const verifier = base64url(randomBytes(64));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const controller = attempt.controller;
  let acceptCallback;
  let rejectCallback;
  let sawStateMismatch = false;
  const callback = new Promise((resolve, reject) => { acceptCallback = resolve; rejectCallback = reject; });
  void callback.catch(() => {});
  const { server, redirectUri } = await bindLoopback((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (!request.url || request.url.length > 8192 || request.method !== "GET") {
      response.writeHead(400).end("Invalid request.");
      rejectCallback(desktopError("callback_rejected", "The browser returned an invalid response."));
      return;
    }
    let url;
    try { url = new URL(request.url, redirectUri); }
    catch {
      response.writeHead(400).end("Invalid request.");
      return;
    }
    if (url.pathname !== "/oauth/callback") {
      response.writeHead(404).end("Not found.");
      return;
    }
    const receivedState = oneParameter(url.searchParams, "state");
    if (!receivedState || !matches(receivedState, state)) {
      sawStateMismatch = true;
      response.writeHead(400).end("Invalid sign-in state.");
      return;
    }
    if (oneParameter(url.searchParams, "iss") !== selected.issuer) {
      response.writeHead(400).end("Invalid sign-in issuer.");
      rejectCallback(desktopError("issuer_mismatch", "The browser response came from another server."));
      return;
    }
    const providerError = oneParameter(url.searchParams, "error");
    if (providerError) {
      response.writeHead(400).end("Sign-in was not completed.");
      rejectCallback(desktopError(providerError === "access_denied" ? "access_denied" : "server_sign_in_failed", "Browser sign-in was denied."));
      return;
    }
    const code = oneParameter(url.searchParams, "code");
    if (!code || code.length > 512) {
      response.writeHead(400).end("Invalid authorization code.");
      rejectCallback(desktopError("callback_rejected", "The browser returned an invalid code."));
      return;
    }
    response.writeHead(303, { Location: selected.webOrigin + "/desktop/connected" }).end();
    acceptCallback(code);
  });
  attempt.server = server;
  attempt.rejectCallback = rejectCallback;
  const timeout = setTimeout(() => {
    rejectCallback(desktopError(sawStateMismatch ? "state_mismatch" : "callback_timeout", "Browser sign-in timed out."));
  }, 300_000);
  try {
    if (attempt.cancelled) throw desktopError("cancelled", "Browser sign-in was cancelled.");
    const authorizationUrl = new URL(selected.apiOrigin + "/desktop/authorize");
    for (const [key, value] of [
      ["client_id", "zilobase-desktop"], ["redirect_uri", redirectUri],
      ["response_type", "code"], ["state", state],
      ["code_challenge", challenge], ["code_challenge_method", "S256"],
    ]) authorizationUrl.searchParams.set(key, value);
    await shell.openExternal(authorizationUrl.toString());
    const code = await callback;
    const tokenTimeout = setTimeout(() => controller.abort(), 15_000);
    let result;
    try {
      const body = new URLSearchParams({
        client_id: "zilobase-desktop", code, code_verifier: verifier,
        grant_type: "authorization_code", redirect_uri: redirectUri,
      });
      result = await readBoundedJson(await fetch(selected.apiOrigin + "/api/auth/desktop/token", {
        method: "POST", body, redirect: "manual", signal: controller.signal,
      }));
    } catch (error) {
      if (error?.code) throw error;
      throw desktopError("token_exchange_failed", "The server rejected the authorization code.");
    } finally { clearTimeout(tokenTimeout); }
    if (result.issuer !== selected.issuer ||
        (!["zilobase-cloud", "zilobase-dev"].includes(selected.instanceId) && result.instance_id !== selected.instanceId)) {
      throw desktopError("issuer_mismatch", "The token belongs to another server.");
    }
    if (result.token_type !== "Bearer" || typeof result.access_token !== "string" ||
        !result.access_token || result.access_token.length > 8192 ||
        typeof result.user?.id !== "string" || !result.user.id || result.user.id.length > 256 ||
        typeof result.expires_at !== "string" || result.expires_at.length > 64) {
      throw desktopError("token_exchange_failed", "The token response is invalid.");
    }
    await credentials.setSession(selected, result.access_token, result.user.id);
    focusWindow();
    return { status: "success" };
  } finally {
    clearTimeout(timeout);
    server.close();
    if (activeAttempt === attempt) activeAttempt = null;
    focusWindow();
  }
}

export function registerOAuthHandlers(handle, focusWindow) {
  handle("desktop:auth:start-browser", async () => {
    if (authorizationInProgress) throw desktopError("already_in_progress", "A browser sign-in is already in progress.");
    authorizationInProgress = true;
    try { return await authorize(focusWindow); }
    finally { authorizationInProgress = false; activeAttempt = null; }
  });
  handle("desktop:auth:cancel-browser", () => {
    if (activeAttempt) activeAttempt.cancelled = true;
    activeAttempt?.controller.abort();
    activeAttempt?.rejectCallback(desktopError("cancelled", "Browser sign-in was cancelled."));
    activeAttempt?.server.close();
  });
  handle("desktop:auth:open-mail-url", async ({ authorizationUrl }) => {
    let url;
    try { url = new URL(authorizationUrl); }
    catch { throw desktopError("invalid_argument", "The authorization URL is invalid."); }
    if (url.protocol !== "https:" || url.hostname !== "accounts.google.com" ||
        url.pathname !== "/o/oauth2/v2/auth" || url.username || url.password) {
      throw desktopError("invalid_argument", "The authorization URL is invalid.");
    }
    await shell.openExternal(url.toString());
  });
}
