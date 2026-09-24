import assert from "node:assert/strict";
import { Hono } from "hono";
import { beforeEach, test, vi } from "vitest";
import type { AppBindings } from "../../shared/types";

const mocks = vi.hoisted(() => ({ membership: vi.fn(), search: vi.fn() }));
vi.mock("../access", () => ({ getMembership: mocks.membership }));
vi.mock("./workspace-search", () => ({ searchWorkspaceItems: mocks.search }));
import { searchRoutes } from "./routes";

function app(
  options: {
    authenticated?: boolean;
    scopes?: string[];
    method?: "oauth" | "session" | "apiKey";
  } = {},
) {
  return new Hono<AppBindings>()
    .use("*", async (c, next) => {
      c.set("user", options.authenticated === false ? null : ({ id: "user-1" } as never));
      c.set("authMethod", options.method ?? "oauth");
      c.set("oauthScopes", options.scopes ?? ["search.read"]);
      c.set("session", { activeWorkspaceId: "granted" } as never);
      c.set("apiKey", options.method === "apiKey" ? ({ workspaceId: "granted" } as never) : null);
      await next();
    })
    .route("/search", searchRoutes);
}

beforeEach(() => {
  mocks.membership.mockReset().mockResolvedValue({ role: "member" });
  mocks.search.mockReset().mockResolvedValue([]);
});

test("search rejects missing OAuth scope before membership or search", async () => {
  const response = await app({ scopes: ["pages.read"] }).request("/search?workspaceId=granted");
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "insufficient_scope",
    error_description: "Missing required scope: search.read",
  });
  assert.match(response.headers.get("www-authenticate") ?? "", /search.read/);
  assert.equal(mocks.membership.mock.calls.length, 0);
  assert.equal(mocks.search.mock.calls.length, 0);
});

test("search rejects other workspaces for OAuth and API keys even when the user has membership", async () => {
  for (const method of ["oauth", "apiKey"] as const) {
    assert.equal((await app({ method }).request("/search?workspaceId=other")).status, 403);
  }
  assert.equal(mocks.membership.mock.calls.length, 0);
  assert.equal(mocks.search.mock.calls.length, 0);
});

test("search requires identity, a workspace and current membership", async () => {
  assert.equal(
    (await app({ authenticated: false }).request("/search?workspaceId=granted")).status,
    401,
  );
  assert.equal((await app().request("/search")).status, 400);
  mocks.membership.mockResolvedValue(null);
  assert.equal((await app().request("/search?workspaceId=granted")).status, 403);
  assert.deepEqual(mocks.membership.mock.calls[0], ["granted", "user-1"]);
  assert.equal(mocks.search.mock.calls.length, 0);
});

test("search delegates valid grants with the user ACL context and returns public search fields", async () => {
  mocks.search.mockResolvedValue([
    {
      id: "page-1",
      type: "page",
      name: "Notes",
      excerpt: "Internal excerpt",
      updatedAt: new Date(),
    },
  ]);
  const response = await app().request(
    "/search?workspaceId=granted&q=Notes&types=page,database,invalid",
  );
  assert.equal(response.status, 200);
  assert.deepEqual(mocks.search.mock.calls[0], [
    {
      limit: 50,
      membershipVerified: true,
      query: "Notes",
      types: ["page", "database"],
      userId: "user-1",
      workspaceId: "granted",
    },
  ]);
  assert.deepEqual(await response.json(), {
    results: [{ id: "page-1", type: "page", name: "Notes" }],
  });
  assert.equal(
    (await app({ method: "session", scopes: [] }).request("/search?workspaceId=other")).status,
    200,
  );
  assert.deepEqual(mocks.search.mock.calls[1], [
    {
      limit: 50,
      membershipVerified: true,
      query: "",
      types: undefined,
      userId: "user-1",
      workspaceId: "other",
    },
  ]);
});
