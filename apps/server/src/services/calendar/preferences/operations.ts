import type { CalendarPreferences } from "@zilobase/features/runtime";
import { z } from "zod";
import {
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../../operations/context";
import { requireCalendarMembership } from "../connections/ownership";
import { readCalendarPreferences, saveCalendarPreferences } from "./preferences";
const TimeZone = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Invalid time zone");
const TimeZoneColumn = z.object({
  zone: TimeZone,
  label: z.string().trim().min(1).max(32),
});
const CalendarKeys = z.array(z.string().max(1024)).max(500);
export const calendarPreferencesSchema = z
  .object({
    promptTimeZoneChanges: z.boolean(),
    timeZoneColumns: z
      .array(TimeZoneColumn)
      .min(1)
      .max(4)
      .refine(
        (columns) => new Set(columns.map((column) => column.zone)).size === columns.length,
        "Time zones must be unique",
      ),
    todayAlignment: z.enum(["week", "start"]),
    meetingPreviewMinutes: z.int().min(0).max(1440),
    mapsProvider: z.enum(["google", "apple"]),
    hourHeight: z.int().min(32).max(120),
    accountOrder: CalendarKeys,
    calendarOrder: CalendarKeys,
    collapsedAccountIds: CalendarKeys,
    calendarColors: z
      .record(
        z.string().max(1024),
        z.enum(["red", "orange", "yellow", "green", "blue", "purple", "gray"]),
      )
      .refine((value) => Object.keys(value).length <= 500, "Too many calendar colors"),
    removedCalendarKeys: CalendarKeys,
    view: z.enum(["day", "week", "month", "agenda"]),
    hiddenCalendarKeys: CalendarKeys,
    defaultCalendarKey: z.string().max(1024).nullable(),
    weekStartsOn: z.literal([0, 1, 2, 3, 4, 5, 6]),
    showWeekends: z.boolean(),
    showDeclined: z.boolean(),
    showWeekNumbers: z.boolean(),
    timeFormat: z.enum(["12", "24"]),
    timeZone: TimeZone,
    remindersEnabled: z.boolean(),
  })
  .transform((raw): CalendarPreferences => ({ ...raw, timeZone: raw.timeZoneColumns[0]!.zone }));
export type GetCalendarPreferencesOperationInput = { workspaceId: string };
export async function getCalendarPreferencesOperation(
  context: ServerOperationContext,
  operationInput: GetCalendarPreferencesOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  if (!context.authentication.user)
    throw new ServerOperationError({ message: "Authentication required." }, 401);
  const actor = context.authentication.user;
  requireOperationWorkspace(context, operationInput.workspaceId);
  await requireCalendarMembership(actor.id, operationInput.workspaceId);

  return calendarPreferencesSchema.parse(
    await readCalendarPreferences(context.authentication.user!.id, operationInput.workspaceId!),
  );
}

export type SaveCalendarPreferencesOperationInput = { workspaceId: string; body?: unknown };
export async function saveCalendarPreferencesOperation(
  context: ServerOperationContext,
  operationInput: SaveCalendarPreferencesOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  if (!context.authentication.user)
    throw new ServerOperationError({ message: "Authentication required." }, 401);
  const actor = context.authentication.user;
  requireOperationWorkspace(context, operationInput.workspaceId);
  await requireCalendarMembership(actor.id, operationInput.workspaceId);

  const data = calendarPreferencesSchema.parse(await readBody());
  await saveCalendarPreferences(context.authentication.user!.id, operationInput.workspaceId!, data);
  return data;
}
