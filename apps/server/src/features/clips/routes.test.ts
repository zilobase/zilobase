import { beforeEach, expect, test, vi } from "vitest";
import type { Context } from "hono";

const create = vi.hoisted(() =>
  vi.fn(async (_input: unknown) => ({ pageId: "clip", url: "/p/clip" })),
);
vi.mock("./create-clip-service", () => ({ createClipService: create, findDuplicateClip: vi.fn() }));
vi.mock("../api-keys", () => ({ rejectMismatchedApiKeyWorkspace: () => null }));
vi.mock("../auth/oauth-access", () => ({
  rejectMismatchedPinnedWorkspace: () => null,
  requireOAuthScope: () => null,
}));
vi.mock("../../shared/http/auth", () => ({
  getAuthenticatedUser: async () => ({ id: "user" }),
  readAuthenticatedJson: async (c: Context) => ({
    ok: true,
    user: { id: "user" },
    body: await c.req.json(),
  }),
}));

import { clipRoutes } from "./routes";
const valid = {
  workspaceId: "workspace",
  title: "  Article  ",
  sourceUrl: "https://example.com",
  captureMode: "article",
};
const submit = (body: unknown) =>
  clipRoutes.request("/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => create.mockClear());

test("clip route rejects invalid required and optional fields before creating content", async () => {
  for (const [field, value, error] of [
    ["workspaceId", "", "workspaceId is required"],
    ["title", "  ", "title is required"],
    ["sourceUrl", "javascript:alert(1)", "sourceUrl must be an http(s) URL"],
    ["captureMode", "invalid", "captureMode is invalid"],
    ["parentPageId", 1, "parentPageId must be a string or null"],
    ["databaseId", {}, "databaseId must be a string or null"],
    ["duplicateStrategy", "invalid", "duplicateStrategy is invalid"],
    ["html", [], "html must be a string"],
    ["note", 1, "note must be a string"],
  ] as const) {
    const response = await submit({ ...valid, [field]: value });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
  }
  expect(create).not.toHaveBeenCalled();
});

test("clip route preserves optional fields and normalizes omitted values", async () => {
  const response = await submit(valid);
  expect(response.status).toBe(201);
  expect(create.mock.calls[0][0]).toMatchObject({
    request: {
      ...valid,
      title: "Article",
      parentPageId: null,
      databaseId: null,
      teamspaceId: null,
      canonicalUrl: null,
      note: null,
      html: null,
      content: null,
      duplicateStrategy: "create",
    },
  });
  const optional = {
    parentPageId: "parent",
    databaseId: "db",
    note: "note",
    html: "<p>text</p>",
    duplicateStrategy: "open-existing",
  };
  await submit({ ...valid, ...optional });
  expect(create.mock.calls[1][0]).toMatchObject({ request: optional });
});
