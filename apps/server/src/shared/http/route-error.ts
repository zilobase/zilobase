import { HTTPException } from "hono/http-exception";
import type { Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import * as z from "zod";

import type { AppBindings } from "../types";

type HttpRouteError = Error & {
  status: number;
  code?: unknown;
  retryAfterSeconds?: unknown;
  validation?: unknown;
};

export function isHttpRouteError(error: unknown): error is HttpRouteError {
  if (!(error instanceof Error) || !("status" in error)) return false;
  const status = (error as { status: unknown }).status;
  return typeof status === "number" && Number.isInteger(status) && status >= 400 && status < 600;
}

export function httpRouteErrorResponse(c: Context<AppBindings>, error: unknown) {
  if (error instanceof HTTPException) {
    return applyContextHeaders(c, error.getResponse());
  }

  if (error instanceof z.ZodError) {
    return c.json(
      {
        code: "VALIDATION_ERROR",
        error: "Invalid request body",
        issues: error.issues,
      },
      400,
    );
  }

  if (!isHttpRouteError(error)) return null;

  const status = error.status as ContentfulStatusCode;
  const body: Record<string, unknown> = { error: error.message };

  if (typeof error.code === "string" && error.code.length > 0) {
    body.code = error.code;
  }
  if (error.validation) body.validation = error.validation;
  if (typeof error.retryAfterSeconds === "number") {
    body.retryAfterSeconds = error.retryAfterSeconds;
    c.header("Retry-After", String(error.retryAfterSeconds));
  }

  return applyContextHeaders(c, c.json(body, status));
}

export function attachHttpRouteErrorHandler(app: Hono<AppBindings>) {
  app.onError(
    (error, c) =>
      httpRouteErrorResponse(c, error) ?? c.json({ error: "Internal server error" }, 500),
  );
  return app;
}

function applyContextHeaders(c: Context<AppBindings>, response: Response) {
  const next = new Response(response.body, response);
  c.res.headers.forEach((value, key) => {
    if (!next.headers.has(key)) next.headers.set(key, value);
  });
  return next;
}
