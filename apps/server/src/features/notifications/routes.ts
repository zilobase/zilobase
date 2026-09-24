import { Hono, type Context } from "hono";

import type { AppBindings } from "../../shared/types";
import {
  listInProductNotifications,
  markInProductNotificationRead,
} from "./notification-operations";

export const notificationRoutes = new Hono<AppBindings>();

notificationRoutes.get("/:workspaceId/notifications", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return handle(c, () =>
    listInProductNotifications({
      limit: Number(c.req.query("limit") ?? 50),
      userId: user.id,
      workspaceId: c.req.param("workspaceId"),
    }),
  );
});

notificationRoutes.post("/:workspaceId/notifications/:notificationId/read", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return handle(c, () =>
    markInProductNotificationRead({
      notificationId: c.req.param("notificationId"),
      userId: user.id,
      workspaceId: c.req.param("workspaceId"),
    }),
  );
});

async function handle(c: Context<AppBindings>, action: () => Promise<object>) {
  return c.json(await action());
}
