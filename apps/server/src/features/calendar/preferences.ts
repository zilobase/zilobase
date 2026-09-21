import { Schema, SchemaTransformation } from "effect";
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { defaultCalendarPreferences } from "@zilobase/features/calendar";
import { db } from "../../infrastructure/database";
import { calendarPreference } from "../../infrastructure/database/schema";
import type { AppBindings } from "../../shared/types";

const TimeZone = Schema.String.pipe(
  Schema.check(Schema.isMaxLength(100)),
  Schema.check(
    Schema.makeFilter((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return undefined;
      } catch {
        return "Invalid time zone";
      }
    }),
  ),
);

const TimeZoneColumn = Schema.Struct({
  zone: TimeZone,
  label: Schema.String.pipe(
    Schema.decode(SchemaTransformation.trim()),
    Schema.check(Schema.isMinLength(1), Schema.isMaxLength(32)),
  ),
});

const CalendarPreferencesBase = Schema.Struct({
  promptTimeZoneChanges: Schema.Boolean,
  timeZoneColumns: Schema.Array(TimeZoneColumn).pipe(
    Schema.check(Schema.isMinLength(1), Schema.isMaxLength(4)),
    Schema.check(
      Schema.makeFilter(
        (columns) =>
          new Set(columns.map((column) => column.zone)).size === columns.length
            ? undefined
            : "Time zones must be unique",
      ),
    ),
  ),
  todayAlignment: Schema.Literals(["week", "start"]),
  meetingPreviewMinutes: Schema.Int.pipe(
    Schema.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(1440)),
  ),
  mapsProvider: Schema.Literals(["google", "apple"]),
  hourHeight: Schema.Int.pipe(
    Schema.check(Schema.isGreaterThanOrEqualTo(32), Schema.isLessThanOrEqualTo(120)),
  ),
  accountOrder: Schema.Array(Schema.String.pipe(Schema.check(Schema.isMaxLength(1024)))).pipe(
    Schema.check(Schema.isMaxLength(500)),
  ),
  calendarOrder: Schema.Array(Schema.String.pipe(Schema.check(Schema.isMaxLength(1024)))).pipe(
    Schema.check(Schema.isMaxLength(500)),
  ),
  collapsedAccountIds: Schema.Array(Schema.String.pipe(Schema.check(Schema.isMaxLength(1024)))).pipe(
    Schema.check(Schema.isMaxLength(500)),
  ),
  calendarColors: Schema.Record(
    Schema.String.pipe(Schema.check(Schema.isMaxLength(1024))),
    Schema.Literals(["red", "orange", "yellow", "green", "blue", "purple", "gray"]),
  ).pipe(
    Schema.check(
      Schema.makeFilter(
        (value) =>
          Object.keys(value).length <= 500 ? undefined : "Too many calendar colors",
      ),
    ),
  ),
  removedCalendarKeys: Schema.Array(Schema.String.pipe(Schema.check(Schema.isMaxLength(1024)))).pipe(
    Schema.check(Schema.isMaxLength(500)),
  ),
  view: Schema.Literals(["day", "week", "month"]),
  hiddenCalendarKeys: Schema.Array(Schema.String.pipe(Schema.check(Schema.isMaxLength(1024)))).pipe(
    Schema.check(Schema.isMaxLength(500)),
  ),
  defaultCalendarKey: Schema.NullOr(Schema.String.pipe(Schema.check(Schema.isMaxLength(1024)))),
  weekStartsOn: Schema.Literals([0, 1, 2, 3, 4, 5, 6]),
  showWeekends: Schema.Boolean,
  showDeclined: Schema.Boolean,
  showWeekNumbers: Schema.Boolean,
  timeFormat: Schema.Literals(["12", "24"]),
  timeZone: TimeZone,
  remindersEnabled: Schema.Boolean,
});

import type { CalendarPreferences, CalendarTimeZoneColumn } from "@zilobase/features/calendar";

export const calendarPreferencesSchema = {
  ...CalendarPreferencesBase,
  parse: (input: unknown): CalendarPreferences => {
    const raw = Schema.decodeUnknownSync(CalendarPreferencesBase)(input);
    const columns: CalendarTimeZoneColumn[] = raw.timeZoneColumns.map((c) => ({ zone: c.zone, label: c.label }));
    return {
      ...raw,
      timeZoneColumns: columns,
      timeZone: columns[0]!.zone,
      accountOrder: [...raw.accountOrder],
      calendarOrder: [...raw.calendarOrder],
      collapsedAccountIds: [...raw.collapsedAccountIds],
      removedCalendarKeys: [...raw.removedCalendarKeys],
      hiddenCalendarKeys: [...raw.hiddenCalendarKeys],
      calendarColors: { ...raw.calendarColors },
    };
  },
  safeParse: (input: unknown): { success: true; data: CalendarPreferences } | { success: false; error: unknown } => {
    try {
      return { success: true, data: calendarPreferencesSchema.parse(input) };
    } catch (error) {
      return { success: false, error };
    }
  },
};
export const calendarPreferenceRoutes = new Hono<AppBindings>();
calendarPreferenceRoutes.get("/preferences", async c => {
  const [row] = await db.select().from(calendarPreference).where(and(eq(calendarPreference.userId, c.get("user")!.id), eq(calendarPreference.workspaceId, c.req.param("workspaceId")!)));
  return c.json(calendarPreferencesSchema.parse(row ? row.data : defaultCalendarPreferences()));
});
calendarPreferenceRoutes.put("/preferences", async c => {
  const data = calendarPreferencesSchema.parse(await c.req.json());
  await db.insert(calendarPreference).values({ userId: c.get("user")!.id, workspaceId: c.req.param("workspaceId")!, data }).onConflictDoUpdate({ target: [calendarPreference.userId, calendarPreference.workspaceId], set: { data } });
  return c.json(data);
});
