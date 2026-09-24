import { readJsonBody } from "./request";
import type { Context } from "hono";

import type { AppBindings } from "../types";

export function getAuthenticatedUser(c: Context<AppBindings>) {
  return c.get("user") ?? null;
}

/** Preserve authentication before parsing and the existing object/array body contract. */
export async function readAuthenticatedJson(c: Context<AppBindings>) {
  const user = getAuthenticatedUser(c);
  if (!user) return { ok: false as const, response: c.json({ error: "Unauthorized" }, 401) };
  const body = await readJsonBody(c.req);
  if (!body || typeof body !== "object")
    return { ok: false as const, response: c.json({ error: "A JSON body is required" }, 400) };
  return { ok: true as const, user, body };
}
