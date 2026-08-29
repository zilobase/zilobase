import { Hono } from "hono";
import type { Context } from "hono";

import {
  getMembership,
} from "../../access";
import { rejectMismatchedApiKeyWorkspace } from "../../api-keys";
import type { AppBindings } from "../../shared/types";
import { searchWorkspaceItems } from "./service";

export const searchRoutes = new Hono<AppBindings>();

const maxSearchResults = 50;

const requireUser = (c: Context<AppBindings>) => c.get("user") ?? null;

searchRoutes.get("/", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const workspaceId = c.req.query("workspaceId");

  if (!workspaceId) {
    return c.json({ error: "workspaceId is required" }, 400);
  }

  const mismatch = rejectMismatchedApiKeyWorkspace(c, workspaceId);

  if (mismatch) {
    return mismatch;
  }

  if (!(await getMembership(workspaceId, user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const requestedTypes = (c.req.query("types") ?? "")
    .split(",")
    .filter((type): type is "database" | "page" =>
      type === "database" || type === "page",
    );

  const results = await searchWorkspaceItems({
    limit: maxSearchResults,
    membershipVerified: true,
    query: c.req.query("q") ?? "",
    types: requestedTypes.length ? requestedTypes : undefined,
    userId: user.id,
    workspaceId,
  });

  return c.json({
    results: results.map(({ excerpt: _excerpt, updatedAt: _updatedAt, ...result }) =>
      result,
    ),
  });
});
