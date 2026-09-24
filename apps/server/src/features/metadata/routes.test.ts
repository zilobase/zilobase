import assert from "node:assert/strict";
import { Hono } from "hono";
import { test, vi } from "vitest";
import { metadataRoutes } from "./routes";
import type { AppBindings } from "../../shared/types";

function app(authenticated = true) {
  return new Hono<AppBindings>()
    .use("*", async (c, next) => {
      if (authenticated)
        c.set("user", {
          id: "user",
          name: "User",
          email: "user@example.test",
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          image: null,
        });
      await next();
    })
    .route("/", metadataRoutes);
}

test("bookmark metadata preserves authentication and URL rejection before fetching", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  try {
    assert.equal((await app(false).request("/bookmark?url=example.test")).status, 401);
    assert.equal((await app().request("/bookmark?url=localhost")).status, 400);
    assert.equal((await app().request("/bookmark?url=127.0.0.1")).status, 400);
    assert.equal(fetch.mock.calls.length, 0);
  } finally {
    vi.unstubAllGlobals();
  }
});

test("bookmark metadata preserves HTML precedence, relative URLs and failure statuses", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(
        '<title>Fallback</title><meta property="og:title" content="Preferred &amp; title"><meta name="description" content="Description"><meta property="og:image" content="/image.png"><link rel="icon" href="/icon.png">',
        { headers: { "content-type": "text/html" } },
      ),
    );
  vi.stubGlobal("fetch", fetch);
  try {
    const response = await app().request("/bookmark?url=example.test/path");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      description: "Description",
      favicon: "https://example.test/icon.png",
      image: "https://example.test/image.png",
      title: "Preferred & title",
    });
    assert.equal(fetch.mock.calls[0][0], "https://example.test/path");
    assert.equal(fetch.mock.calls[0][1].redirect, "follow");
    fetch.mockResolvedValueOnce(new Response("no", { status: 404 }));
    assert.equal((await app().request("/bookmark?url=example.test")).status, 502);
    fetch.mockResolvedValueOnce(
      new Response("{}", { headers: { "content-type": "application/json" } }),
    );
    assert.equal((await app().request("/bookmark?url=example.test")).status, 415);
    fetch.mockRejectedValueOnce(new Error("network failed"));
    assert.equal((await app().request("/bookmark?url=example.test")).status, 502);
  } finally {
    vi.unstubAllGlobals();
  }
});
