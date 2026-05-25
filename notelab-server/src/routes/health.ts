import { Hono } from "hono";
import type { AppBindings } from "../types";

export const healthRoutes = new Hono<AppBindings>();

healthRoutes.get("/", (c) => {
  return c.json({ ok: true, service: "notelab-server" });
});
