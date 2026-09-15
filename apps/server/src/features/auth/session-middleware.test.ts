import assert from "node:assert/strict";
import { Hono } from "hono";
import { beforeEach, test, vi } from "vitest";

import type {
  AppBindings,
  ZilobaseEditionExtension,
} from "../../shared/types";

const mocks = vi.hoisted(() => ({
  createAuth: vi.fn(),
  database: { id: "session-middleware-database" },
  expireTemporaryMemberships: vi.fn(async () => undefined),
  getMembership: vi.fn(async () => ({ id: "membership-1" })),
}));

vi.mock("../../infrastructure/database", () => ({
  db: mocks.database,
  runWithDbEnv: async (_env: unknown, run: () => unknown) => run(),
}));
vi.mock("../access", () => ({ getMembership: mocks.getMembership }));
vi.mock("../memberships", () => ({
  expireTemporaryMemberships: mocks.expireTemporaryMemberships,
}));
vi.mock("./auth", () => ({ createAuth: mocks.createAuth }));

import { sessionMiddleware } from "./session-middleware";

const user = {
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  email: "person@example.com",
  emailVerified: true,
  id: "user-1",
  image: null,
  name: "Example Person",
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};
const session = {
  activeOrganizationId: "workspace-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  expiresAt: new Date("2026-01-02T00:00:00.000Z"),
  id: "session-1",
  ipAddress: null,
  token: "session-token",
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  userAgent: null,
  userId: user.id,
};

beforeEach(() => {
  mocks.createAuth.mockReset();
  mocks.expireTemporaryMemberships.mockClear();
  mocks.getMembership.mockClear();
  mocks.getMembership.mockResolvedValue({ id: "membership-1" });
  mocks.createAuth.mockResolvedValue({
    api: { getSession: vi.fn(async () => ({ session, user })) },
  });
});

test("session middleware is unchanged when no edition policy is installed", async () => {
  const response = await createSessionApp().request("/");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    authMethod: "session",
    userId: "user-1",
    workspaceId: "workspace-1",
  });
});

test("session middleware returns an edition policy denial after membership validation", async () => {
  const assertSession = vi.fn<
    NonNullable<ZilobaseEditionExtension["assertSession"]>
  >(async () => ({
      code: "SESSION_POLICY_DENIED",
      message: "This session does not satisfy workspace policy.",
      status: 403,
    }));
  const response = await createSessionApp(createExtension(assertSession))
    .request("/");

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    code: "SESSION_POLICY_DENIED",
    message: "This session does not satisfy workspace policy.",
  });
  assert.equal(mocks.getMembership.mock.invocationCallOrder[0]
    < assertSession.mock.invocationCallOrder[0], true);
  const assertion = assertSession.mock.calls[0]?.[0];
  assert.equal(assertion?.request.url, "http://localhost/");
  const { request: _request, ...assertionWithoutRequest } = assertion!;
  assert.deepEqual(assertionWithoutRequest, {
    authMethod: "session",
    database: mocks.database,
    session: { ...session, activeWorkspaceId: "workspace-1" },
    user,
  });
});

function createSessionApp(extension?: ZilobaseEditionExtension) {
  const app = new Hono<AppBindings>();
  app.use("*", async (c, next) => {
    c.set("editionExtension", extension ?? null);
    c.set("serverTimings", []);
    await next();
  });
  app.use("*", sessionMiddleware);
  app.get("/", (c) => c.json({
    authMethod: c.get("authMethod"),
    userId: c.get("user")?.id,
    workspaceId: c.get("session")?.activeWorkspaceId,
  }));
  return app;
}

function createExtension(
  assertSession: NonNullable<ZilobaseEditionExtension["assertSession"]>,
): ZilobaseEditionExtension {
  return {
    id: "test-edition",
    capabilities: [],
    async createAuthPlugins() { return []; },
    async beforeMembershipGrant() {},
    assertSession,
    async recordSecurityEvent() {},
    registerRoutes() {},
  };
}
