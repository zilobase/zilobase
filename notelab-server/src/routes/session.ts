import { Hono } from "hono";
import type { AppBindings } from "../types";

export const sessionRoutes = new Hono<AppBindings>();

sessionRoutes.get("/", (c) => {
  const user = c.get("user");
  const session = c.get("session");

  if (!user) {
    return c.json({ user: null, session: null }, 401);
  }

  return c.json({ user, session });
});
