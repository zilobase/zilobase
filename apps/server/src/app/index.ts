import { Hono, type ErrorHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { methodNotAllowed } from "hono/method-not-allowed";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { createCorsMiddleware } from "./cors";
import { registerRoutes } from "./routes";
import { authenticatedSessionMiddleware } from "../features/auth/session-guard";
import { REQUEST_ID_HEADER, serverTimingMiddleware } from "./timing";
import {
  DATABASE_UNAVAILABLE_CODE,
  DATABASE_UNAVAILABLE_MESSAGE,
  getDatabaseErrorCode,
  isDatabaseUnavailableError,
} from "../shared/errors/database-errors";
import { JSON_BODY_LIMIT_BYTES } from "../shared/http/json";
import { httpRouteErrorResponse } from "../shared/http/route-error";
import { registerAppEditionExtension } from "../shared/edition-extension-registry";
import type { AppBindings, AppErrorReporter } from "../shared/types";
import type { EditionExtensionOptions } from "../shared/types";
import { demoWriteGuard } from "../features/demo/write-guard";
import { runWithBackgroundTraceContext } from "../infrastructure/background/contracts";
import { communityAppPolicy } from "../shared/app-policy";
import { runWithRuntimePorts } from "@zilobase/runtime-adapter/capabilities";

export function createApp(options: EditionExtensionOptions = {}) {
  const app = new Hono<AppBindings>();
  const appPolicy = options.policy ?? communityAppPolicy;
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
  app.use("*", (c, next) => {
    c.set("editionExtension", options.editionExtension ?? null);
    c.set("appPolicy", appPolicy);
    c.set("runtimePorts", options.ports ?? null);
    return options.ports
      ? runWithRuntimePorts(options.ports, next)
      : next();
  });
  app.use("*", createCorsMiddleware());
  app.use(
    "*",
    secureHeaders({
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
      originAgentCluster: false,
      referrerPolicy: "no-referrer",
      xFrameOptions: "DENY",
    }),
  );
  app.use("*", requestId({ headerName: REQUEST_ID_HEADER }));
  app.use(
    "*",
    bodyLimit({
      maxSize: JSON_BODY_LIMIT_BYTES,
      onError: (c) => c.json({ error: "Request body is too large" }, 413),
    }),
  );
  if (appPolicy.compression) {
    app.use("*", compress({ contentTypeFilter: /^application\/json/i }));
  }
  app.use("*", methodNotAllowed({ app }));
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

    const routed = httpRouteErrorResponse(c, error);
    if (routed) return routed;

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
