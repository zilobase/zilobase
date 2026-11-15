import { Hono } from "hono";
import { z } from "zod";
import {
  CalendarAccessError,
  requireCalendarMembership,
} from "../../services/calendar/connections/ownership";
import { CalendarProviderError } from "../../services/calendar/provider/gateway";
import type { AppBindings } from "../../shared/contracts/http";
import { calendarConfigurationRoutes } from "./configuration/routes";
import { calendarConnectionRoutes } from "./connections/routes";
import { calendarEventRoutes } from "./events/routes";
import { calendarPreferenceRoutes } from "./preferences/routes";
import { calendarCallbackRoutes } from "./provider/routes";
import { calendarRealtimeRoutes } from "./realtime/routes";
import { calendarSyncRoutes } from "./sync/routes";
import { calendarWebhookRoutes } from "./webhooks/routes";
export const calendarRoutes = new Hono<AppBindings>();
export const calendarProviderRoutes = new Hono<AppBindings>();
for (const app of [calendarRoutes, calendarProviderRoutes]) {
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store, max-age=0");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Content-Type-Options", "nosniff");
    await next();
  });
  app.onError((error, c) => {
    if (error instanceof z.ZodError) return c.json({ message: "Invalid calendar request." }, 400);
    if (error instanceof CalendarAccessError)
      return c.json({ message: error.message }, error.status);
    if (error instanceof CalendarProviderError)
      return c.json(
        { message: error.code, code: error.code, retryAfterMs: error.retryAfterMs },
        calendarErrorStatus(error.status),
      );
    return c.json({ message: "Calendar request failed." }, 500);
  });
}
calendarRoutes.use("*", async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ message: "Authentication required." }, 401);
  await requireCalendarMembership(user.id, c.req.param("workspaceId")!);
  await next();
});
calendarRoutes.route("/", calendarConnectionRoutes);

calendarProviderRoutes.route("/", calendarCallbackRoutes);

calendarRoutes.route("/", calendarPreferenceRoutes);

calendarRoutes.route("/", calendarSyncRoutes);

calendarRoutes.route("/", calendarEventRoutes);

calendarRoutes.route("/", calendarRealtimeRoutes);
calendarProviderRoutes.route("/", calendarWebhookRoutes);

calendarRoutes.route("/", calendarConfigurationRoutes);

function calendarErrorStatus(status: number): 400 | 401 | 403 | 404 | 409 | 412 | 429 | 502 {
  const supported = [400, 401, 403, 404, 409, 412, 429] as const;
  return supported.find((code) => code === status) ?? 502;
}
