import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import type { AppBindings } from "../types";
import { getAuthenticatedUser } from "./auth";

describe("getAuthenticatedUser", () => {
  it("returns the authenticated user without changing authorization semantics", async () => {
    const app = new Hono<AppBindings>();
    app.use("*", async (c, next) => {
      c.set("user", { id: "user-1" } as AppBindings["Variables"]["user"]);
      await next();
    });
    app.get("/", (c) => c.json({ id: getAuthenticatedUser(c)?.id }));

    await expect((await app.request("/")).json()).resolves.toEqual({ id: "user-1" });
  });

  it("returns null when middleware did not authenticate the request", async () => {
    const app = new Hono<AppBindings>();
    app.get("/", (c) => c.json({ authenticated: Boolean(getAuthenticatedUser(c)) }));

    await expect((await app.request("/")).json()).resolves.toEqual({ authenticated: false });
  });
});
