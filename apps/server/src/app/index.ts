import { Hono, type ErrorHandler } from "hono";
import { createCorsMiddleware } from "./cors";
import { registerRoutes } from "./routes";
import { authenticatedSessionMiddleware } from "./session";
import { serverTimingMiddleware } from "./timing";
import {
  DATABASE_UNAVAILABLE_CODE,
  DATABASE_UNAVAILABLE_MESSAGE,
  getDatabaseErrorCode,
  isDatabaseUnavailableError,
} from "../shared/errors/database-errors";
import { registerAppEditionExtension } from "../shared/edition-extension-registry";
import type { AppBindings } from "../shared/types";
import type { EditionExtensionOptions } from "../shared/types";

export function createApp(options: EditionExtensionOptions = {}) {
  const app = new Hono<AppBindings>();
  registerAppEditionExtension(app, options.editionExtension);

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
