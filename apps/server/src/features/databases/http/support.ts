import type { Context } from "hono";

import { getAuthenticatedUser } from   "../../../shared/http/auth";
import type { AppBindings } from   "../../../shared/types";

export function requireDatabaseRouteUser(c: Context<AppBindings>) {
  return getAuthenticatedUser(c);
}
