import { Hono } from "hono";
import type { AppBindings } from "../../shared/contracts/http";
import { contentVerificationOperation } from "../../services/pages/verification";
import { serverOperationContext } from "../http/operation-context";
import { readJsonBody } from "../http/request";
import { attachServiceErrorHandler } from "../http/route-error";

export function createContentVerificationRoutes(type: "page" | "database") {
  const routes = attachServiceErrorHandler(new Hono<AppBindings>());
  routes.get("/:id/verification", async (c) =>
    c.json(
      await contentVerificationOperation(serverOperationContext(c), {
        type,
        id: c.req.param("id"),
        action: "read",
      }),
    ),
  );
  routes.put("/:id/verification", async (c) =>
    c.json(
      await contentVerificationOperation(serverOperationContext(c), {
        type,
        id: c.req.param("id"),
        action: "verify",
        body: await readJsonBody(c.req),
      }),
    ),
  );
  routes.delete("/:id/verification", async (c) =>
    c.json(
      await contentVerificationOperation(serverOperationContext(c), {
        type,
        id: c.req.param("id"),
        action: "remove",
      }),
    ),
  );
  return routes;
}
