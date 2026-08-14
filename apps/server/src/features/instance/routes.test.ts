import assert from "node:assert/strict";
import { Hono } from "hono";
import { beforeEach, test, vi } from "vitest";

import type { AppBindings } from "../../types";

const mocks = vi.hoisted(() => {
  class BootstrapAlreadyCompletedError extends Error {}
  class BootstrapStateConflictError extends Error {}
  class InvalidBootstrapTokenError extends Error {}

  return {
    BootstrapAlreadyCompletedError,
    BootstrapStateConflictError,
    InvalidBootstrapTokenError,
    bootstrap: vi.fn(),
    discovery: vi.fn(),
    membership: vi.fn(),
    readSettings: vi.fn(),
    selfHosted: vi.fn(),
    updateSettings: vi.fn(),
  };
});

vi.mock("../../access", () => ({ getMembership: mocks.membership }));
vi.mock("../../runtime-adapter", () => ({
  isSelfHostedRuntime: mocks.selfHosted,
}));
vi.mock("./service", () => ({
  getZilobaseDiscoveryDocument: mocks.discovery,
}));
vi.mock("./registration", () => ({
  BootstrapAlreadyCompletedError: mocks.BootstrapAlreadyCompletedError,
  BootstrapStateConflictError: mocks.BootstrapStateConflictError,
  InvalidBootstrapTokenError: mocks.InvalidBootstrapTokenError,
  bootstrapSelfHostedInstance: mocks.bootstrap,
  canManageInstanceSettings: (role: string | null | undefined) =>
    role === "owner",
  getInstanceAdministrationSettings: mocks.readSettings,
  updateInstanceAdministrationSettings: mocks.updateSettings,
}));

import { instanceRoutes } from "./routes";

const settings = {
  bootstrapCompleted: true,
  displayName: "Example",
  instanceId: "instance-1",
  pinnedWorkspaceId: "workspace-1",
  registrationMode: "invite-only",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selfHosted.mockReturnValue(true);
  mocks.membership.mockResolvedValue({ role: "owner" });
  mocks.readSettings.mockResolvedValue(settings);
  mocks.updateSettings.mockResolvedValue({
    displayName: "Example",
    registrationMode: "open",
  });
});

function appFor(options: {
  authMethod?: "apiKey" | "session" | null;
  user?: { id: string } | null;
} = {}) {
  const app = new Hono<AppBindings>();
  app.use("*", async (c, next) => {
    c.set("authMethod", options.authMethod ?? "session");
    c.set("apiKey", null);
    c.set("requestId", "request-1");
    c.set("serverTimings", []);
    c.set("session", null);
    c.set(
      "user",
      (options.user === undefined ? { id: "user-1" } : options.user) as never,
    );
    await next();
  });
  app.route("/", instanceRoutes);
  return app;
}

test("bootstrap reads the secret from a header and never from the body", async () => {
  mocks.bootstrap.mockResolvedValue({
    instanceId: "instance-1",
    registrationMode: "invite-only",
    userId: "user-1",
    workspaceId: "workspace-1",
  });
  const body = {
    email: "owner@example.com",
    name: "Owner",
    password: "secure-password",
    token: "body-token-must-be-ignored",
    workspaceName: "Workspace",
  };
  const response = await appFor({ user: null }).request(
    "/api/instance/bootstrap",
    {
      body: JSON.stringify(body),
      headers: {
        authorization: "Bearer header-token",
        "content-type": "application/json",
      },
      method: "POST",
    },
    {},
  );

  assert.equal(response.status, 201);
  assert.equal(mocks.bootstrap.mock.calls[0]?.[1], "header-token");
  assert.deepEqual(mocks.bootstrap.mock.calls[0]?.[2], {
    email: body.email,
    name: body.name,
    password: body.password,
    workspaceName: body.workspaceName,
  });
});

test("instance settings require an owner browser session", async () => {
  const anonymous = await appFor({ user: null }).request(
    "/api/instance/settings",
  );
  const apiKey = await appFor({ authMethod: "apiKey" }).request(
    "/api/instance/settings",
  );
  mocks.membership.mockResolvedValueOnce({ role: "admin" });
  const admin = await appFor().request("/api/instance/settings");

  assert.equal(anonymous.status, 401);
  assert.equal(apiKey.status, 401);
  assert.equal(admin.status, 403);
});

test("the owner can read and update registration mode", async () => {
  const read = await appFor().request("/api/instance/settings");
  const update = await appFor().request("/api/instance/settings", {
    body: JSON.stringify({ registrationMode: "open" }),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });

  assert.equal(read.status, 200);
  assert.equal(
    ((await read.json()) as any).settings.registrationMode,
    "invite-only",
  );
  assert.equal(update.status, 200);
  assert.deepEqual(mocks.updateSettings.mock.calls[0]?.[0], {
    registrationMode: "open",
  });
});

test("hosted runtime does not expose self-host administration", async () => {
  mocks.selfHosted.mockReturnValue(false);

  assert.equal(
    (await appFor().request("/api/instance/settings")).status,
    404,
  );
  assert.equal(
    (await appFor({ user: null }).request("/api/instance/bootstrap", {
      body: "{}",
      headers: { "content-type": "application/json" },
      method: "POST",
    })).status,
    404,
  );
});
