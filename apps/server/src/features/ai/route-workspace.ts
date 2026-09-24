import type { Context } from "hono";
import type { AppBindings } from "../../shared/types";

/** Session workspace remains authoritative; the header is only a fallback. */
export function requestedAiWorkspaceId(c: Context<AppBindings>) {
  return c.get("session")?.activeWorkspaceId ?? c.req.header("x-zilobase-workspace-id")?.trim();
}
