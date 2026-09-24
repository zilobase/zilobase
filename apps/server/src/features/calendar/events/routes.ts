import { Hono } from "hono";
import { Schema } from "effect";
import type { AppBindings } from "../../../shared/types";
import { calendarWriteSchema, type CalendarMutationAction } from "./input";
import { mutateCalendarEvent, reconcileCalendarOperation } from "./mutations";

const CalendarMutationActionSchema = Schema.Literals([
  "update",
  "delete",
  "duplicate",
  "rsvp",
  "move",
]);
const CalendarMutationExtra = Schema.Struct({
  destination: Schema.optionalKey(Schema.String.pipe(Schema.check(Schema.isMaxLength(1024)))),
  responseStatus: Schema.optionalKey(Schema.Literals(["accepted", "declined", "tentative"])),
});

export const calendarEventRoutes = new Hono<AppBindings>();

calendarEventRoutes.post("/connections/:bindingId/calendars/:calendarId/events", async (c) => {
  const write = calendarWriteSchema.parse(await c.req.json());
  const result = await mutateCalendarEvent(c.env, {
    userId: c.get("user")!.id,
    workspaceId: c.req.param("workspaceId")!,
    bindingId: c.req.param("bindingId"),
    calendarId: c.req.param("calendarId"),
    action: "create",
    write,
  });
  return c.json(result, result.status === "succeeded" ? 200 : 202);
});

calendarEventRoutes.post(
  "/connections/:bindingId/calendars/:calendarId/events/:eventId/:action",
  async (c) => {
    const action = Schema.decodeUnknownSync(CalendarMutationActionSchema)(
      c.req.param("action"),
    ) as CalendarMutationAction;
    const body = await c.req.json();
    const write = calendarWriteSchema.parse(body);
    const extra = Schema.decodeUnknownSync(CalendarMutationExtra)(body);
    const result = await mutateCalendarEvent(c.env, {
      userId: c.get("user")!.id,
      workspaceId: c.req.param("workspaceId")!,
      bindingId: c.req.param("bindingId"),
      calendarId: c.req.param("calendarId"),
      eventId: c.req.param("eventId"),
      action,
      write,
      ...extra,
    });
    return c.json(result, result.status === "succeeded" ? 200 : 202);
  },
);

calendarEventRoutes.get("/operations/:operationId", async (c) =>
  c.json(
    await reconcileCalendarOperation(c.env, {
      userId: c.get("user")!.id,
      workspaceId: c.req.param("workspaceId")!,
      operationId: c.req.param("operationId"),
    }),
  ),
);
