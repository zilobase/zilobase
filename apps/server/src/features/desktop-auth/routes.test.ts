import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { Hono } from "hono";

import type { AppBindings } from "../../types";

const mocks = vi.hoisted(() => ({
  createdSessionUserIds: [] as string[],
  insertedCodes: [] as Record<string, unknown>[],
  updateResults: [] as unknown[][],
}));

vi.mock("../../db", () => ({
  db: {
    insert() {
      return {
        async values(value: Record<string, unknown>) {
          mocks.insertedCodes.push(value);
        },
      };
    },
    async transaction(run: (transaction: unknown) => unknown) {
      return run({});
    },
    update() {
      const builder = {
        set() {
          return builder;
        },
        where() {
          return builder;
        },
        async returning() {
          return mocks.updateResults.shift() ?? [];
        },
      };
      return builder;
    },
  },
  runWithDb: (_database: unknown, run: () => unknown) => run(),
  runWithDbEnv: (_env: unknown, run: () => unknown) => run(),
}));

vi.mock("../../auth", () => ({
  createAuth: () => ({
    $context: Promise.resolve({
      internalAdapter: {
        async createSession(userId: string) {
          mocks.createdSessionUserIds.push(userId);
          return {
            expiresAt: new Date("2026-08-21T00:00:00.000Z"),
            token: "desktop-session-token",
          };
        },
      },
    }),
  }),
}));

vi.mock("../instance/service", () => ({
  getZilobaseDiscoveryDocument: async () => ({
    apiOrigin: "https://api.example.com",
    displayName: "Team Notes",
    instanceId: "instance-1",
    issuer: "https://api.example.com",
  }),
}));

import { desktopAuthRoutes } from "./routes";
import {
  createDesktopConsentToken,
  derivePkceChallenge,
  DESKTOP_AUTH_CLIENT_ID,
  hashDesktopAuthorizationCode,
  parseDesktopAuthorizationRequest,
} from "./service";

const env = {
  BETTER_AUTH_SECRET: "desktop-consent-test-secret-with-at-least-32-characters",
  BETTER_AUTH_URL: "https://api.example.com",
  CLIENT_URL: "https://app.example.com",
};
const verifier = "v".repeat(64);

beforeEach(() => {
  mocks.createdSessionUserIds.length = 0;
  mocks.insertedCodes.length = 0;
  mocks.updateResults.length = 0;
});

test("desktop landing page exposes a secret-free connection link", async () => {
  const response = await appFor(false).request(
    "https://api.example.com/desktop",
    {},
    env,
  );
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /Open in Zilobase Desktop/);
  assert.match(
    body,
    /zilobase:\/\/connect\?server=https%3A%2F%2Fapi\.example\.com/,
  );
  assert.match(body, /readonly value="https:\/\/api\.example\.com"/);
  assert.doesNotMatch(body, /token|code=/);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});

test("authorization page sends anonymous users through the selected server login", async () => {
  const response = await appFor(false).request(authorizationUrl(), {}, env);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /Continue to sign in/);
  assert.match(body, /https:\/\/app\.example\.com\/login\?returnTo=/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(
    response.headers.get("content-security-policy") ?? "",
    /frame-ancestors 'none'/,
  );
});

test("consent page permits only its validated loopback callback origin", async () => {
  const response = await appFor(true).request(authorizationUrl(), {}, env);
  const contentSecurityPolicy =
    response.headers.get("content-security-policy") ?? "";

  assert.equal(response.status, 200);
  assert.match(
    contentSecurityPolicy,
    /form-action 'self' http:\/\/127\.0\.0\.1:43123(?:;|$)/,
  );
  assert.doesNotMatch(contentSecurityPolicy, /127\.0\.0\.1:\*/);
  assert.doesNotMatch(contentSecurityPolicy, /attacker/);
});

test("authenticated consent stores only a hashed short-lived code", async () => {
  const parameters = consentParameters();
  const response = await appFor(true).request(
    "https://api.example.com/desktop/authorize/consent",
    {
      body: parameters.toString(),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "null",
      },
      method: "POST",
    },
    env,
  );
  const callback = new URL(response.headers.get("location") ?? "");
  const rawCode = callback.searchParams.get("code") ?? "";
  const stored = mocks.insertedCodes[0];

  assert.equal(response.status, 303);
  assert.equal(callback.origin, "http://127.0.0.1:43123");
  assert.equal(callback.searchParams.get("state"), "s".repeat(43));
  assert.equal(callback.searchParams.get("iss"), "https://api.example.com");
  assert.ok(rawCode.length >= 43);
  assert.equal(stored?.codeHash, hashDesktopAuthorizationCode(rawCode));
  assert.notEqual(stored?.codeHash, rawCode);
  assert.equal(stored?.userId, "user-1");
});

test("consent rejects cross-origin form submissions", async () => {
  const response = await appFor(true).request(
    "https://api.example.com/desktop/authorize/consent",
    {
      body: consentParameters().toString(),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://attacker.example.com",
      },
      method: "POST",
    },
    env,
  );

  assert.equal(response.status, 403);
  assert.equal(mocks.insertedCodes.length, 0);
});

test("consent rejects a missing or tampered signed consent token", async () => {
  for (const parameters of [
    authorizationParameters(),
    consentParameters({ consent_token: "tampered" }),
  ]) {
    parameters.set("decision", "allow");
    const response = await appFor(true).request(
      "https://api.example.com/desktop/authorize/consent",
      {
        body: parameters.toString(),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "https://api.example.com",
        },
        method: "POST",
      },
      env,
    );

    assert.equal(response.status, 400);
  }
  assert.equal(mocks.insertedCodes.length, 0);
});

test("token exchange creates a separate Better Auth desktop session", async () => {
  mocks.updateResults.push([
    { activeWorkspaceId: "workspace-1", userId: "user-1" },
  ]);
  const body = new URLSearchParams({
    client_id: DESKTOP_AUTH_CLIENT_ID,
    code: "c".repeat(64),
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: "http://127.0.0.1:43123/oauth/callback",
  });
  const response = await appFor(false).request(
    "https://api.example.com/api/auth/desktop/token",
    {
      body: body.toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    },
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    access_token: "desktop-session-token",
    expires_at: "2026-08-21T00:00:00.000Z",
    instance_id: "instance-1",
    issuer: "https://api.example.com",
    token_type: "Bearer",
    user: { id: "user-1" },
  });
  assert.deepEqual(mocks.createdSessionUserIds, ["user-1"]);
});

test("invalid, expired, or replayed codes return the same invalid-grant response", async () => {
  mocks.updateResults.push([], []);
  const body = new URLSearchParams({
    client_id: DESKTOP_AUTH_CLIENT_ID,
    code: "c".repeat(64),
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: "http://127.0.0.1:43123/oauth/callback",
  }).toString();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await appFor(false).request(
      "https://api.example.com/api/auth/desktop/token",
      {
        body,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
      },
      env,
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_grant" });
  }
  assert.equal(mocks.createdSessionUserIds.length, 0);
});

test("desktop auth request bodies are bounded even without a content length", async () => {
  const response = await appFor(false).request(
    "https://api.example.com/api/auth/desktop/token",
    {
      body: `code=${"x".repeat(20 * 1024)}`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    },
    env,
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_request" });
  assert.equal(mocks.createdSessionUserIds.length, 0);
});

function appFor(authenticated: boolean) {
  const app = new Hono<AppBindings>();
  app.use("*", async (c, next) => {
    c.set(
      "user",
      authenticated
        ? ({ email: "user@example.com", id: "user-1", name: "User" } as never)
        : null,
    );
    c.set(
      "session",
      authenticated
        ? ({ activeWorkspaceId: "workspace-1", id: "browser-session" } as never)
        : null,
    );
    await next();
  });
  app.route("/", desktopAuthRoutes);
  return app;
}

function authorizationUrl() {
  return `https://api.example.com/desktop/authorize?${authorizationParameters()}`;
}

function authorizationParameters() {
  return new URLSearchParams({
    client_id: DESKTOP_AUTH_CLIENT_ID,
    code_challenge: derivePkceChallenge(verifier),
    code_challenge_method: "S256",
    redirect_uri: "http://127.0.0.1:43123/oauth/callback",
    response_type: "code",
    state: "s".repeat(43),
  });
}

function consentParameters(overrides: Record<string, string> = {}) {
  const parameters = authorizationParameters();
  const request = parseDesktopAuthorizationRequest(parameters);
  parameters.set(
    "consent_token",
    createDesktopConsentToken(request, "user-1", env.BETTER_AUTH_SECRET),
  );
  parameters.set("decision", "allow");

  for (const [name, value] of Object.entries(overrides)) {
    parameters.set(name, value);
  }

  return parameters;
}
