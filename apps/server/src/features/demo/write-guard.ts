import type { MiddlewareHandler } from "hono";

import type { AppBindings } from "../../shared/types";

export const DEMO_READ_ONLY_CODE = "DEMO_READ_ONLY";
export const DEMO_READ_ONLY_ERROR =
  "Changes are disabled in the hosted demo.";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const demoWriteGuard: MiddlewareHandler<AppBindings> = async (
  c,
  next,
) => {
  if (
    c.get("authMethod") === "demo" &&
    (
      !READ_METHODS.has(c.req.method.toUpperCase()) ||
      c.req.path.startsWith("/api/auth/")
    )
  ) {
    return c.json(
      { code: DEMO_READ_ONLY_CODE, error: DEMO_READ_ONLY_ERROR },
      403,
    );
  }

  await next();
};
