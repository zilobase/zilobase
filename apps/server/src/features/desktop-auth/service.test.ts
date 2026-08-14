import assert from "node:assert/strict";
import { test } from "vitest";

import {
  buildDesktopCallbackUrl,
  consumeDesktopAuthorizationCode,
  createDesktopConsentToken,
  derivePkceChallenge,
  DESKTOP_AUTH_CLIENT_ID,
  DesktopAuthorizationError,
  hashDesktopAuthorizationCode,
  isValidDesktopRedirectUri,
  parseDesktopAuthorizationRequest,
  parseDesktopTokenRequest,
  verifyDesktopConsentToken,
  type DesktopAuthorizationCodeRepository,
} from "./service";

const redirectUri = "http://127.0.0.1:43123/oauth/callback";
const verifier = "a".repeat(64);
const code = "b".repeat(64);

function authorizationParameters(overrides: Record<string, string> = {}) {
  return new URLSearchParams({
    client_id: DESKTOP_AUTH_CLIENT_ID,
    code_challenge: derivePkceChallenge(verifier),
    code_challenge_method: "S256",
    redirect_uri: redirectUri,
    response_type: "code",
    state: "s".repeat(43),
    ...overrides,
  });
}

function tokenRequest(overrides: Record<string, string> = {}) {
  return parseDesktopTokenRequest(
    new URLSearchParams({
      client_id: DESKTOP_AUTH_CLIENT_ID,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      ...overrides,
    }),
  );
}

test("desktop authorization accepts only authorization-code S256 loopback requests", () => {
  assert.deepEqual(
    parseDesktopAuthorizationRequest(authorizationParameters()),
    {
      clientId: DESKTOP_AUTH_CLIENT_ID,
      codeChallenge: derivePkceChallenge(verifier),
      redirectUri,
      state: "s".repeat(43),
    },
  );

  for (const invalidRedirect of [
    "https://127.0.0.1:43123/oauth/callback",
    "http://example.com:43123/oauth/callback",
    "http://127.0.0.1/oauth/callback",
    "http://127.0.0.1:43123/other",
    "http://user@127.0.0.1:43123/oauth/callback",
    "http://127.0.0.1:43123/oauth/callback?next=bad",
  ]) {
    assert.equal(isValidDesktopRedirectUri(invalidRedirect), false);
  }
});

test("desktop authorization rejects duplicate, weak, and unsupported parameters", () => {
  const duplicate = authorizationParameters();
  duplicate.append("state", "x".repeat(43));

  for (const parameters of [
    authorizationParameters({ code_challenge_method: "plain" }),
    authorizationParameters({ code_challenge: "short" }),
    authorizationParameters({ client_id: "unknown" }),
    authorizationParameters({ response_type: "token" }),
    duplicate,
  ]) {
    assert.throws(
      () => parseDesktopAuthorizationRequest(parameters),
      DesktopAuthorizationError,
    );
  }
});

test("desktop token requests require the original client, callback, and verifier", () => {
  assert.equal(tokenRequest().codeVerifier, verifier);

  for (const overrides of [
    { client_id: "unknown" },
    { grant_type: "refresh_token" },
    { redirect_uri: "http://localhost:43123/other" },
    { code_verifier: "short" },
    { code: "short" },
  ] as Record<string, string>[]) {
    assert.throws(() => tokenRequest(overrides), DesktopAuthorizationError);
  }

  const duplicate = new URLSearchParams({
    client_id: DESKTOP_AUTH_CLIENT_ID,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  duplicate.append("code", "c".repeat(64));
  assert.throws(
    () => parseDesktopTokenRequest(duplicate),
    DesktopAuthorizationError,
  );
});

test("authorization callbacks preserve state and identify the exact issuer", () => {
  const callback = new URL(
    buildDesktopCallbackUrl(
      { redirectUri, state: "s".repeat(43) },
      "https://api.example.com",
      { code },
    ),
  );

  assert.equal(callback.origin, "http://127.0.0.1:43123");
  assert.equal(callback.searchParams.get("code"), code);
  assert.equal(callback.searchParams.get("state"), "s".repeat(43));
  assert.equal(callback.searchParams.get("iss"), "https://api.example.com");
});

test("desktop consent tokens are short-lived and bound to the user and request", () => {
  const request = parseDesktopAuthorizationRequest(authorizationParameters());
  const secret = "desktop-consent-test-secret-with-at-least-32-characters";
  const issuedAt = new Date("2026-08-14T12:00:00.000Z");
  const token = createDesktopConsentToken(request, "user-1", secret, issuedAt);

  assert.equal(
    verifyDesktopConsentToken(
      token,
      request,
      "user-1",
      secret,
      new Date("2026-08-14T12:09:59.999Z"),
    ),
    true,
  );
  assert.equal(
    verifyDesktopConsentToken(token, request, "user-2", secret, issuedAt),
    false,
  );
  assert.equal(
    verifyDesktopConsentToken(
      token,
      { ...request, state: "x".repeat(43) },
      "user-1",
      secret,
      issuedAt,
    ),
    false,
  );
  assert.equal(
    verifyDesktopConsentToken(
      token,
      request,
      "user-1",
      secret,
      new Date("2026-08-14T12:10:00.000Z"),
    ),
    false,
  );
  assert.equal(
    verifyDesktopConsentToken("malformed", request, "user-1", secret),
    false,
  );
});

test("authorization codes are hashed and consumed atomically once", async () => {
  const repository = inMemoryRepository();
  const request = tokenRequest();
  const [first, second] = await Promise.all([
    consumeDesktopAuthorizationCode(request, repository),
    consumeDesktopAuthorizationCode(request, repository),
  ]);

  assert.equal([first, second].filter(Boolean).length, 1);
  assert.equal(
    await consumeDesktopAuthorizationCode(request, repository),
    null,
  );
  assert.notEqual(hashDesktopAuthorizationCode(code), code);
});

test("wrong verifier and redirect URI do not consume an authorization code", async () => {
  const repository = inMemoryRepository();

  assert.equal(
    await consumeDesktopAuthorizationCode(
      tokenRequest({ code_verifier: "c".repeat(64) }),
      repository,
    ),
    null,
  );
  assert.equal(
    await consumeDesktopAuthorizationCode(
      tokenRequest({ redirect_uri: "http://localhost:43123/oauth/callback" }),
      repository,
    ),
    null,
  );
  assert.deepEqual(
    await consumeDesktopAuthorizationCode(tokenRequest(), repository),
    { activeWorkspaceId: "workspace-1", userId: "user-1" },
  );
});

test("expired authorization codes cannot be consumed", async () => {
  const repository = inMemoryRepository(new Date("2026-08-14T11:59:59.000Z"));

  assert.equal(
    await consumeDesktopAuthorizationCode(
      tokenRequest(),
      repository,
      new Date("2026-08-14T12:00:00.000Z"),
    ),
    null,
  );
});

function inMemoryRepository(
  expiresAt = new Date(Date.now() + 60_000),
): DesktopAuthorizationCodeRepository {
  let consumed = false;
  const stored = {
    codeChallenge: derivePkceChallenge(verifier),
    codeHash: hashDesktopAuthorizationCode(code),
    redirectUri,
  };

  return {
    async consume(input) {
      if (
        consumed ||
        expiresAt <= input.now ||
        input.codeChallenge !== stored.codeChallenge ||
        input.codeHash !== stored.codeHash ||
        input.redirectUri !== stored.redirectUri
      ) {
        return null;
      }

      consumed = true;
      return { activeWorkspaceId: "workspace-1", userId: "user-1" };
    },
  };
}
