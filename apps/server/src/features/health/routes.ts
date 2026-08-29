import { Hono } from "hono";
import type { AppBindings } from "../../shared/types";
import { checkReadiness } from "./readiness";

export const healthRoutes = new Hono<AppBindings>();

healthRoutes.get("/", (c) => {
  return c.json({ ok: true, service: "zilobase-server" });
});

healthRoutes.get("/health", (c) => {
  return c.json({ ok: true, service: "zilobase-server" });
});

healthRoutes.get("/ready", async (c) => {
  const result = await checkReadiness(c.env);

  if (result.ok) {
    return c.json(result);
  }

  console.warn(JSON.stringify({
    checks: result.checks,
    event: "readiness_check_failed",
    requestId: c.get("requestId"),
  }));
  c.header("Retry-After", "5");
  return c.json(result, 503);
});
