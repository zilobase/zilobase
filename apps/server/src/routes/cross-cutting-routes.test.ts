import assert from "node:assert/strict";
import { Hono } from "hono";
import { beforeEach, test, vi } from "vitest";

import type { AppBindings } from "../types";

const mocks = vi.hoisted(() => ({
  membership: vi.fn(),
  privileged: vi.fn(),
  selectResults: [] as unknown[][],
  selfHosted: vi.fn(),
}));

vi.mock("../access", () => ({
  getMembership: mocks.membership,
  isPrivilegedOrgRole: mocks.privileged,
}));
vi.mock("../api-keys", () => ({
  API_KEY_DEFAULT_EXPIRES_IN_SECONDS: 2_592_000,
  API_KEY_PREFIX: "zilo",
  readApiKeyWorkspaceId: (metadata: any) => metadata?.workspaceId ?? null,
  rejectMismatchedApiKeyWorkspace: () => null,
}));
vi.mock("../auth", () => ({ createAuth: vi.fn() }));
vi.mock("../runtime-adapter", () => ({
  isSelfHostedRuntime: mocks.selfHosted,
}));
vi.mock("../db", () => ({
  db: {
    select() {
      const rows = mocks.selectResults.shift() ?? [];
      const builder = {
        from() { return builder; },
        innerJoin() { return builder; },
        where() { return builder; },
        orderBy() { return builder; },
        async limit() { return rows; },
        then(resolve: (value: unknown[]) => unknown) {
          return Promise.resolve(rows).then(resolve);
        },
      };
      return builder;
    },
  },
}));

import { apiKeyRoutes } from "./api-keys";
import { sessionRoutes } from "./session";
import { pageSettingsRoutes } from "./user-settings";
import { profileImageRoutes } from "./profile-images";
import { workspaceRoutes } from "./workspaces";

const user = {
  email: "user@example.com",
  id: "user-1",
  image: null,
  name: "User",
};

beforeEach(() => {
  mocks.membership.mockReset();
  mocks.membership.mockResolvedValue({ role: "owner" });
  mocks.privileged.mockReset();
  mocks.privileged.mockReturnValue(true);
  mocks.selectResults.length = 0;
  mocks.selfHosted.mockReset();
  mocks.selfHosted.mockReturnValue(false);
});

function appFor(
  routes: Hono<AppBindings>,
  options: { authMethod?: "apiKey" | "session"; authenticated?: boolean } = {},
) {
  const app = new Hono<AppBindings>();
  app.use("*", async (c, next) => {
    c.set("user", options.authenticated === false ? null : user as never);
    c.set("session", null);
    c.set("authMethod", options.authMethod ?? "session");
    c.set("apiKey", null);
    c.set("serverTimings", []);
    await next();
  });
  app.route("/", routes);
  return app;
}

test("session route returns an explicit anonymous response", async () => {
  const response = await appFor(sessionRoutes, { authenticated: false }).request("/");
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { session: null, user: null });
});

test("session route reports password capability and timing", async () => {
  mocks.selectResults.push([{ id: "credential-account" }]);
  const response = await appFor(sessionRoutes).request("/");
  const body = await response.json() as any;
  assert.equal(response.status, 200);
  assert.equal(body.user.hasPassword, true);
  assert.equal(body.workspacePinned, false);
});

test("workspace routes enforce authentication and validated admin updates", async () => {
  const unauthorized = await appFor(workspaceRoutes, { authenticated: false })
    .request("/workspace-1/access-targets");
  assert.equal(unauthorized.status, 401);

  const invalid = await appFor(workspaceRoutes).request("/workspace-1", {
    body: JSON.stringify({ slug: "Invalid Slug" }),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
  assert.equal(invalid.status, 400);
});

test("workspace routes reject non-admin updates", async () => {
  mocks.privileged.mockReturnValue(false);
  const response = await appFor(workspaceRoutes).request("/workspace-1", {
    body: JSON.stringify({ name: "Updated" }),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "Only workspace admins can update settings.",
  });
});

test("workspace access targets return scoped members and teams", async () => {
  mocks.selectResults.push(
    [{ email: "user@example.com", id: "user-1", memberId: "member-1", name: "User", role: "owner" }],
    [{ id: "team-1", name: "Engineering" }],
  );
  const response = await appFor(workspaceRoutes)
    .request("/workspace-1/access-targets");
  const body = await response.json() as any;
  assert.equal(response.status, 200);
  assert.equal(body.members[0].memberId, "member-1");
  assert.equal(body.teams[0].id, "team-1");
});

test("user settings routes validate settings and profile payloads", async () => {
  const settings = await appFor(pageSettingsRoutes).request("/", {
    body: JSON.stringify({ pageFullWidth: "yes" }),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
  assert.equal(settings.status, 400);

  const sidebarSettings = await appFor(pageSettingsRoutes).request("/", {
    body: JSON.stringify({ sidebarConfig: [] }),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
  assert.equal(sidebarSettings.status, 400);

  const profile = await appFor(pageSettingsRoutes).request("/profile", {
    body: JSON.stringify({ email: "not-an-email" }),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
  assert.equal(profile.status, 400);
});

test("profile image uploads validate file type and size", async () => {
  const app = appFor(profileImageRoutes);
  const unsupported = await app.request(
    "/image/uploads",
    {
      body: JSON.stringify({
        byteSize: 100,
        contentType: "image/svg+xml",
        filename: "avatar.svg",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
    {},
  );
  assert.equal(unsupported.status, 400);

  const tooLarge = await app.request(
    "/image/uploads",
    {
      body: JSON.stringify({
        byteSize: 5 * 1024 * 1024 + 1,
        contentType: "image/png",
        filename: "avatar.png",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
    {},
  );
  assert.equal(tooLarge.status, 400);
});

test("user settings route returns existing normalized preferences", async () => {
  mocks.selectResults.push([{
    embeddedItemsOpenAs: "dialog",
    pageFullWidth: true,
    sidebarConfig: {
      hiddenItems: ["calendar", "unknown"],
      libraryView: "shared",
      sectionOrder: ["shared", "private"],
    },
  }]);
  const response = await appFor(pageSettingsRoutes).request("/");
  assert.deepEqual(await response.json(), {
    settings: {
      embeddedItemsOpenAs: "dialog",
      pageFullWidth: true,
      sidebarConfig: {
        hiddenItems: ["calendar"],
        libraryView: "shared",
        sectionLimits: { recents: 10, favorites: 10, private: 10, shared: 10 },
        sectionOrder: ["recents", "shared", "private", "favorites"],
        sectionSorts: {
          recents: "lastEdited",
          favorites: "lastEdited",
          private: "lastEdited",
          shared: "lastEdited",
        },
      },
    },
  });
});

test("API key routes require sessions and validate create input", async () => {
  const apiKeyAuth = await appFor(apiKeyRoutes, { authMethod: "apiKey" })
    .request("/?workspaceId=workspace-1");
  assert.equal(apiKeyAuth.status, 403);

  const invalid = await appFor(apiKeyRoutes).request("/", {
    body: JSON.stringify({ name: "", workspaceId: "" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json() as any).error, "Invalid API key input");
});

test("API key list filters records to the requested workspace", async () => {
  const now = new Date("2026-08-03T00:00:00.000Z");
  mocks.selectResults.push([
    {
      createdAt: now,
      enabled: true,
      expiresAt: null,
      id: "key-1",
      lastRequest: null,
      metadata: { workspaceId: "workspace-1" },
      name: "Automation",
      prefix: "zilo",
      referenceId: "user-1",
      requestCount: 0,
      start: "zilo_abcd",
      updatedAt: now,
    },
    {
      createdAt: now,
      enabled: true,
      expiresAt: null,
      id: "key-2",
      lastRequest: null,
      metadata: { workspaceId: "workspace-2" },
      name: "Other",
      prefix: "zilo",
      referenceId: "user-1",
      requestCount: 0,
      start: "zilo_efgh",
      updatedAt: now,
    },
  ]);
  const response = await appFor(apiKeyRoutes)
    .request("/?workspaceId=workspace-1");
  const body = await response.json() as any;
  assert.equal(response.status, 200);
  assert.deepEqual(body.keys.map((key: any) => key.id), ["key-1"]);
});
