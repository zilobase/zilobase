import { Hono, type ErrorHandler } from "hono";
import { createCorsMiddleware } from "./cors";
import { registerRoutes } from "./routes";
import { authenticatedSessionMiddleware } from "../features/auth/session-guard";
import { serverTimingMiddleware } from "./timing";
import {
  DATABASE_UNAVAILABLE_CODE,
  DATABASE_UNAVAILABLE_MESSAGE,
  getDatabaseErrorCode,
  isDatabaseUnavailableError,
} from "../shared/errors/database-errors";
import { registerAppEditionExtension } from "../shared/edition-extension-registry";
import type { AppBindings, AppErrorReporter } from "../shared/types";
import type { EditionExtensionOptions } from "../shared/types";
import { demoWriteGuard } from "../features/demo/write-guard";
import { runWithBackgroundTraceContext } from "../infrastructure/background/contracts";

export function createApp(options: EditionExtensionOptions = {}) {
  const app = new Hono<AppBindings>();
  registerAppEditionExtension(app, options.editionExtension);

  app.use("*", (c, next) =>
    runWithBackgroundTraceContext(
      {
        traceparent: c.req.header("traceparent"),
        tracestate: c.req.header("tracestate"),
      },
      next,
    ),
  );
  app.use("*", async (c, next) => {
    c.set("editionExtension", options.editionExtension ?? null);
    await next();
  });
  app.use("*", createCorsMiddleware());
  app.use("*", serverTimingMiddleware);
  app.use("*", authenticatedSessionMiddleware);
  app.use("*", demoWriteGuard);
  registerRoutes(app);
  options.editionExtension?.registerRoutes(app);
  app.onError(createAppErrorHandler(options.errorReporter));

  return app;
}

export function createAppErrorHandler(
  errorReporter?: AppErrorReporter,
): ErrorHandler<AppBindings> {
  return async (error, c) => {
    if (isDatabaseUnavailableError(error)) {
      const code = getDatabaseErrorCode(error) ?? DATABASE_UNAVAILABLE_CODE;
      console.error(
        JSON.stringify({
          code,
          error: error.message,
          event: "database_connection_failed",
          requestId: c.get("requestId"),
          route: c.req.path,
        }),
      );
      await reportAppError(errorReporter, error, c, code, 503);
      c.header("Retry-After", "5");
      return c.json(
        {
          code: DATABASE_UNAVAILABLE_CODE,
          message: DATABASE_UNAVAILABLE_MESSAGE,
        },
        503,
      );
    }

    console.error(
      JSON.stringify({
        error: error.message,
        event: "unhandled_request_error",
        requestId: c.get("requestId"),
        route: c.req.path,
      }),
    );
    await reportAppError(
      errorReporter,
      error,
      c,
      "UNHANDLED_REQUEST_ERROR",
      500,
    );
    return c.json({ error: "Internal server error" }, 500);
  };
}

export const appErrorHandler = createAppErrorHandler();

async function reportAppError(
  reporter: AppErrorReporter | undefined,
  error: Error,
  c: Parameters<ErrorHandler<AppBindings>>[1],
  code: string,
  status: 500 | 503,
) {
  if (!reporter) return;

  try {
    await reporter(
      {
        code,
        error,
        method: c.req.method,
        requestId: c.get("requestId"),
        route: c.req.routePath || c.req.path,
        status,
        userId: c.get("user")?.id ?? null,
        workspaceId: c.get("session")?.activeWorkspaceId ?? null,
      },
      c.env,
    );
  } catch {
    console.error(
      JSON.stringify({
        event: "error_report_failed",
        requestId: c.get("requestId"),
        route: c.req.routePath || c.req.path,
      }),
    );
  }
}
