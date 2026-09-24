import type { Context } from "hono";
import type { AppBindings } from "../../shared/types";
import { getAuthenticatedUser } from "../../shared/http/auth";
import {
  getPageRecord,
  getEffectivePageAccessInWorkspace,
  hasAccess,
  rejectActiveWorkspaceMismatch,
  type AccessLevel,
} from "../access";

/** Authenticate before loading; deny access before checking active workspace. */
export async function authorizePageRoute(
  c: Context<AppBindings>,
  required: Exclude<AccessLevel, "none">,
) {
  const user = getAuthenticatedUser(c);
  if (!user)
    return {
      ok: false as const,
      response: c.json({ error: "Unauthorized" }, 401),
    };
  const record = await getPageRecord(c.req.param("id")!);
  if (!record)
    return {
      ok: false as const,
      response: c.json({ error: "Page not found" }, 404),
    };
  const accessLevel = await getEffectivePageAccessInWorkspace(
    record.id,
    record.workspaceId,
    user.id,
  );
  if (!hasAccess(accessLevel, required))
    return {
      ok: false as const,
      response: c.json({ error: "Forbidden" }, 403),
    };
  const mismatch = await rejectActiveWorkspaceMismatch(c, record.workspaceId, user.id);
  if (mismatch) return { ok: false as const, response: mismatch };
  return { ok: true as const, user, record, accessLevel };
}
