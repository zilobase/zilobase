import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { Hono } from "hono";

const { sessionMiddleware } = vi.hoisted(() => ({
  sessionMiddleware: vi.fn(async (c) => c.text("authenticated")),
}));

vi.mock("./session-middleware", () => ({ sessionMiddleware }));

import { authenticatedSessionMiddleware } from "./session-guard";
import type { AppBindings } from "../../shared/types";

beforeEach(() => {
  sessionMiddleware.mockClear();
});

test("public root and auth paths bypass session resolution", async () => {
  const app = new Hono<AppBindings>();
  app.use("*", authenticatedSessionMiddleware);
  app.get("/", (c) => c.text("root"));
  app.get("/desktop", (c) => c.text("desktop"));
  app.get("/api/auth/callback", (c) => c.text("callback"));

  assert.equal(await (await app.request("/")).text(), "root");
  assert.equal(await (await app.request("/desktop")).text(), "desktop");
  assert.equal(
    await (await app.request("/api/auth/callback")).text(),
    "callback",
  );
  assert.equal(sessionMiddleware.mock.calls.length, 0);
});

test("protected paths delegate to the authenticated session middleware", async () => {
  const app = new Hono<AppBindings>();
  app.use("*", authenticatedSessionMiddleware);
  app.get("/pages", (c) => c.text("unreachable"));

  const response = await app.request("/pages");

  assert.equal(await response.text(), "authenticated");
  assert.equal(sessionMiddleware.mock.calls.length, 1);
});

test("browser consent resolves a session while the native token exchange stays public", async () => {
  const app = new Hono<AppBindings>();
  app.use("*", authenticatedSessionMiddleware);
  app.get("/desktop/authorize", (c) => c.text("authorize"));
  app.post("/api/auth/desktop/token", (c) => c.text("token"));

  assert.equal(
    await (await app.request("/desktop/authorize")).text(),
    "authenticated",
  );
  assert.equal(
    await (
      await app.request("/api/auth/desktop/token", { method: "POST" })
    ).text(),
    "token",
  );
  assert.equal(sessionMiddleware.mock.calls.length, 1);
});
