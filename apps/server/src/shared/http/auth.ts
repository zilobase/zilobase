import type { Context } from "hono";

import type { AppBindings } from "../types";

export function getAuthenticatedUser(c: Context<AppBindings>) {
  return c.get("user") ?? null;
}
