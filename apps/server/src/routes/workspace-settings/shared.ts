import type { Context } from "hono";

import { getMembership } from "../../access";
import type { AppBindings } from "../../shared/types";

export async function requireActiveWorkspace(c: Context<AppBindings>) {
  const user = c.get("user");
  const session = c.get("session");
  const workspaceId = session?.activeWorkspaceId ?? c.req.header("x-zilobase-workspace-id")?.trim();
  if (!user) return { response: c.json({ error: "Unauthorized" }, 401) };
  if (!workspaceId) return { response: c.json({ error: "No active workspace" }, 409) };
  const membership = await getMembership(workspaceId, user.id);
  if (!membership) return { response: c.json({ error: "Forbidden" }, 403) };
  return { membership, workspaceId, user };
}
