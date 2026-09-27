// Deployment-target-independent API conformance probes.
//
// Compose (scripts/selfhost/test.mjs) and Community Helm
// (scripts/selfhost/test-community-helm.mjs) deploy the same image through
// different targets, so they assert the same public API contract. Both import
// this module so a server behavior change only has to be reflected once.
//
// Keep this module free of bare npm imports: the Helm gate copies it next to
// its runner into a container's /tmp, where node_modules is not resolvable.

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";

import { CookieJar } from "./cookie-jar.mjs";

export { CookieJar };

// 1x1 transparent PNG, used as the object-storage upload probe.
export const PROBE_IMAGE_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const DESKTOP_CLIENT_ID = "zilobase-desktop";
const DESKTOP_REDIRECT_URI = "http://127.0.0.1:43123/oauth/callback";
const COLLABORATION_PROTOCOL = "zilobase.collaboration.v1";
const SESSION_PROTOCOL_PREFIX = "zilobase.session.v1.";

/**
 * @param {object} options
 * @param {string} options.internalOrigin Origin the probes actually connect to.
 * @param {string} [options.publicOrigin] Origin the server advertises and expects
 *   on the Origin header. Defaults to `internalOrigin` (single-origin targets).
 * @param {typeof globalThis.WebSocket} [options.WebSocketImpl]
 */
export function createApiClient({
  internalOrigin,
  publicOrigin = internalOrigin,
  WebSocketImpl = globalThis.WebSocket,
}) {
  assert.ok(internalOrigin, "internalOrigin is required");
  assert.ok(WebSocketImpl, "a WebSocket implementation is required");

  function internal(pathname) {
    return `${internalOrigin}${pathname}`;
  }

  async function getJson(pathname) {
    const response = await fetch(internal(pathname));
    assert.equal(response.status, 200, `GET ${pathname} failed with ${response.status}`);
    return response.json();
  }

  async function requestJson(pathname, { body, cookie, headers = {}, jar, method = "GET" } = {}) {
    const response = await fetch(internal(pathname), {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        origin: publicOrigin,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(cookie ? { cookie } : {}),
        ...(jar?.header() ? { cookie: jar.header() } : {}),
        ...headers,
      },
      method,
    });
    jar?.store(response.headers);
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(`${method} ${pathname} failed ${response.status}: ${text}`);
    return { data, response };
  }

  async function requestForm(
    pathname,
    body,
    { cookie, jar, origin = publicOrigin, redirect } = {},
  ) {
    const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
    if (origin !== undefined) headers.set("origin", origin);
    if (cookie) headers.set("cookie", cookie);
    if (jar?.header()) headers.set("cookie", jar.header());
    const response = await fetch(internal(pathname), {
      body: body.toString(),
      headers,
      method: "POST",
      redirect,
    });
    jar?.store(response.headers);
    return response;
  }

  async function ready() {
    const response = await fetch(internal("/ready"));
    assert.equal(response.status, 200, `/ready failed with ${response.status}`);
    return response.json();
  }

  async function bootstrapInstance({ bootstrapToken, email, name, password, workspaceName }) {
    const bootstrap = await requestJson("/api/instance/bootstrap", {
      body: { email, name, password, workspaceName },
      headers: { "x-zilobase-bootstrap-token": bootstrapToken },
      method: "POST",
    });
    assert.equal(bootstrap.response.status, 201);
    return bootstrap;
  }

  async function assertBootstrapTokenIsSingleUse({
    bootstrapToken,
    email,
    password,
    workspaceName,
  }) {
    const duplicate = await fetch(internal("/api/instance/bootstrap"), {
      body: JSON.stringify({ email, name: "Duplicate", password, workspaceName }),
      headers: {
        "content-type": "application/json",
        origin: publicOrigin,
        "x-zilobase-bootstrap-token": bootstrapToken,
      },
      method: "POST",
    });
    assert.equal(duplicate.status, 409, "the bootstrap token was reusable");
  }

  async function signIn({ email, password, jar }) {
    const signIn = await requestJson("/api/auth/sign-in/email", {
      body: { email, password },
      jar,
      method: "POST",
    });
    assert.equal(signIn.response.status, 200);
    return signIn;
  }

  async function sessionUserId({ cookie }) {
    const response = await fetch(internal("/session"), { headers: { cookie } });
    assert.equal(response.status, 200, `/session failed with ${response.status}`);
    const body = await response.json();
    const userId = body.user?.id ?? body.userId;
    assert.ok(userId, "/session did not return a user id");
    return userId;
  }

  /**
   * Runs the desktop consent flow end to end and returns the issued access token.
   * @param {{ checkReplay?: boolean }} [options]
   */
  async function createDesktopSession(jar, { checkReplay = false } = {}) {
    const verifier = randomBytes(48).toString("base64url");
    const state = randomBytes(32).toString("base64url");
    const authorization = new URLSearchParams({
      client_id: DESKTOP_CLIENT_ID,
      code_challenge: createHash("sha256").update(verifier, "ascii").digest("base64url"),
      code_challenge_method: "S256",
      redirect_uri: DESKTOP_REDIRECT_URI,
      response_type: "code",
      state,
    });

    const consentPage = await fetch(internal(`/desktop/authorize?${authorization}`), {
      headers: { cookie: jar.header() },
    });
    assert.equal(consentPage.status, 200, "/desktop/authorize did not render consent");
    const consentToken = (await consentPage.text()).match(
      /name="consent_token" value="([A-Za-z0-9._-]+)"/,
    )?.[1];
    assert.ok(consentToken, "/desktop/authorize omitted a consent token");
    authorization.set("consent_token", consentToken);
    authorization.set("decision", "allow");

    const consent = await requestForm("/desktop/authorize/consent", authorization, {
      jar,
      origin: "null",
      redirect: "manual",
    });
    assert.equal(consent.status, 303, "/desktop/authorize/consent did not redirect");
    const callback = new URL(consent.headers.get("location"));
    assert.equal(callback.origin, new URL(DESKTOP_REDIRECT_URI).origin);
    assert.equal(callback.searchParams.get("state"), state, "the OAuth state did not round-trip");
    assert.equal(callback.searchParams.get("iss"), internalOrigin, "the issuer did not match");
    const code = callback.searchParams.get("code");
    assert.ok(code, "/desktop/authorize/consent omitted an authorization code");

    const exchange = () =>
      requestForm(
        "/api/auth/desktop/token",
        new URLSearchParams({
          client_id: DESKTOP_CLIENT_ID,
          code,
          code_verifier: verifier,
          grant_type: "authorization_code",
          redirect_uri: DESKTOP_REDIRECT_URI,
        }),
      );
    const token = await exchange();
    assert.equal(token.status, 200, "/api/auth/desktop/token failed");
    const session = await token.json();
    assert.equal(session.token_type, "Bearer");
    assert.equal(session.issuer, internalOrigin, "the session issuer did not match");

    if (checkReplay) {
      const replay = await exchange();
      assert.equal(replay.status, 400, "an authorization code was replayable");
      assert.deepEqual(await replay.json(), { error: "invalid_grant" });
    }

    return session;
  }

  async function createPage(jar, { name, workspaceId }) {
    const created = await requestJson("/pages", {
      body: { content: null, name, type: "pageblock", url: "#", workspaceId },
      jar,
      method: "POST",
    });
    assert.equal(created.response.status, 201, "creating a page did not return 201");
    return created.data.page.id;
  }

  async function renamePage(jar, pageId, name) {
    const updated = await requestJson(`/pages/${pageId}`, {
      body: { name },
      jar,
      method: "PATCH",
    });
    assert.equal(updated.data.page.name, name, "the page rename did not persist");
    return updated;
  }

  async function readPage(cookie, pageId) {
    const page = await requestJson(`/pages/${pageId}`, { cookie });
    return page.data.page;
  }

  async function collaborationTicket(jar, pageId) {
    const ticket = await requestJson(`/pages/${pageId}/collaboration-ticket`, {
      body: {},
      jar,
      method: "POST",
    });
    assert.equal(
      typeof ticket.data.documentName,
      "string",
      "the collaboration ticket had no document",
    );
    assert.equal(typeof ticket.data.token, "string", "the collaboration ticket had no token");
    assert.equal(typeof ticket.data.websocketUrl, "string", "the collaboration ticket had no URL");
    assert.ok(
      new Date(ticket.data.expiresAt).getTime() > Date.now(),
      "the collaboration ticket was already expired",
    );
    return ticket.data;
  }

  /** Rewrites an advertised public websocket URL onto the reachable internal origin. */
  function internalWebSocket(advertisedUrl) {
    const url = new URL(advertisedUrl);
    const internalUrl = new URL(internalOrigin);
    url.protocol = internalUrl.protocol === "https:" ? "wss:" : "ws:";
    url.hostname = internalUrl.hostname;
    url.port = internalUrl.port;
    return url;
  }

  async function openCollaborationSocket({ websocketUrl, accessToken }) {
    const encodedSession = Buffer.from(accessToken, "utf8").toString("base64url");
    const socket = new WebSocketImpl(internalWebSocket(websocketUrl), [
      COLLABORATION_PROTOCOL,
      `${SESSION_PROTOCOL_PREFIX}${encodedSession}`,
    ]);
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("collaboration WebSocket upgrade timed out")),
          15_000,
        );
        socket.addEventListener(
          "open",
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );
        socket.addEventListener(
          "error",
          () => {
            clearTimeout(timeout);
            reject(new Error("collaboration WebSocket upgrade failed"));
          },
          { once: true },
        );
      });
    } finally {
      socket.close();
    }
  }

  async function uploadProfileImage(jar, { filename }) {
    const upload = await requestJson("/user-settings/profile/image/uploads", {
      body: {
        byteSize: PROBE_IMAGE_BYTES.byteLength,
        contentType: "image/png",
        filename,
      },
      jar,
      method: "POST",
    });
    assert.equal(upload.response.status, 200, "requesting an upload slot did not return 200");

    const objectUpload = await fetch(upload.data.upload.url, {
      body: PROBE_IMAGE_BYTES,
      headers: upload.data.upload.headers,
      method: "PUT",
    });
    assert.equal(objectUpload.status, 200, `the object PUT failed with ${objectUpload.status}`);

    const completed = await requestJson(
      `/user-settings/profile/image/uploads/${upload.data.image.id}/complete`,
      {
        body: {
          byteSize: PROBE_IMAGE_BYTES.byteLength,
          contentType: "image/png",
          filename,
        },
        jar,
        method: "POST",
      },
    );
    assert.equal(completed.response.status, 200, "completing the upload did not return 200");
    return { imagePath: completed.data.image, uploadUrl: upload.data.upload.url };
  }

  async function readProfileImage({ cookie, imagePath }) {
    const response = await fetch(internal(imagePath), { headers: { cookie } });
    assert.equal(response.status, 200, `reading ${imagePath} failed with ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  function assertProbeImage(bytes) {
    assert.deepEqual(bytes, PROBE_IMAGE_BYTES, "the stored object did not match the upload");
  }

  return {
    assertBootstrapTokenIsSingleUse,
    assertProbeImage,
    bootstrapInstance,
    collaborationTicket,
    createDesktopSession,
    createPage,
    getJson,
    internalOrigin,
    openCollaborationSocket,
    publicOrigin,
    readPage,
    readProfileImage,
    ready,
    renamePage,
    requestJson,
    sessionUserId,
    signIn,
    uploadProfileImage,
  };
}
