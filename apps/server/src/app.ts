import { Hono, type ErrorHandler } from "hono";
import { createCorsMiddleware } from "./app/cors";
import { registerRoutes } from "./app/routes";
import { authenticatedSessionMiddleware } from "./app/session";
import { serverTimingMiddleware } from "./app/timing";
import {
  DATABASE_UNAVAILABLE_CODE,
  DATABASE_UNAVAILABLE_MESSAGE,
  getDatabaseErrorCode,
  isDatabaseUnavailableError,
} from "./db/errors";
import type { AppBindings } from "./types";
import type { EditionExtensionOptions } from "./edition-extension";

const appEditionExtensions = new WeakMap<
  object,
  EditionExtensionOptions["editionExtension"]
>();

export function createApp(options: EditionExtensionOptions = {}) {
  const app = new Hono<AppBindings>();
  appEditionExtensions.set(app, options.editionExtension);

  app.use("*", async (c, next) => {
    c.set("editionExtension", options.editionExtension ?? null);
    await next();
  });
  app.use("*", createCorsMiddleware());
  app.use("*", serverTimingMiddleware);
  app.use("*", authenticatedSessionMiddleware);
  registerRoutes(app);
  options.editionExtension?.registerRoutes(app);
  app.onError(appErrorHandler);

  return app;
}

export function getAppEditionExtension(app: object) {
  return appEditionExtensions.get(app);
}

export const appErrorHandler: ErrorHandler<AppBindings> = (error, c) => {
  if (isDatabaseUnavailableError(error)) {
    console.error(JSON.stringify({
      code: getDatabaseErrorCode(error),
      error: error.message,
      event: "database_connection_failed",
      requestId: c.get("requestId"),
      route: c.req.path,
    }));
    c.header("Retry-After", "5");
    return c.json(
      {
        code: DATABASE_UNAVAILABLE_CODE,
        message: DATABASE_UNAVAILABLE_MESSAGE,
      },
      503,
    );
  }

  console.error(JSON.stringify({
    error: error.message,
    event: "unhandled_request_error",
    requestId: c.get("requestId"),
    route: c.req.path,
  }));
  return c.json({ error: "Internal server error" }, 500);
};
