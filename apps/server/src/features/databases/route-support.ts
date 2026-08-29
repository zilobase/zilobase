import type { Context } from "hono";

import { ServiceMutationError } from "../../shared/errors/service-mutation-error";
import type { AppBindings } from "../../shared/types";

export function requireDatabaseRouteUser(c: Context<AppBindings>) {
  return c.get("user") ?? null;
}

export function serviceMutationErrorResponse(
  c: Context<AppBindings>,
  error: ServiceMutationError,
) {
  return c.json(
    { error: error.message },
    error.status === 403
      ? 403
      : error.status === 404
        ? 404
        : error.status === 409
          ? 409
          : 400,
  );
}
