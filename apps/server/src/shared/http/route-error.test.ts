import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";
import * as z from "zod";

import { ServiceMutationError } from "../errors/service-mutation-error";
import type { AppBindings } from "../types";
import { httpRouteErrorResponse, isHttpRouteError } from "./route-error";

describe("http route errors", () => {
  it("recognizes domain errors that already carry an HTTP status", () => {
    expect(isHttpRouteError(new ServiceMutationError("missing", 404))).toBe(true);
    expect(isHttpRouteError(new Error("plain"))).toBe(false);
  });

  it("maps HTTPException, Zod, and domain errors through the app context", async () => {
    const app = new Hono<AppBindings>();
    app.use("*", async (c, next) => {
      c.header("Cache-Control", "private, no-store");
      await next();
    });
    app.get("/exception", () => {
      throw new HTTPException(401, { message: "Unauthorized" });
    });
    app.get("/zod", () => {
      const parsed = z.object({ name: z.string() }).safeParse({});
      if (!parsed.success) throw parsed.error;
      return Response.json(parsed.data);
    });
    app.get("/domain", () => {
      throw new ServiceMutationError("Database not found", 404);
    });
    app.onError(
      (error, c) =>
        httpRouteErrorResponse(c, error) ?? c.json({ error: "Internal server error" }, 500),
    );

    const unauthorized = await app.request("/exception");
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("cache-control")).toBe("private, no-store");
    expect(await unauthorized.text()).toBe("Unauthorized");

    const invalid = await app.request("/zod");
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      error: "Invalid request body",
    });

    const missing = await app.request("/domain");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "Database not found" });
  });
});
