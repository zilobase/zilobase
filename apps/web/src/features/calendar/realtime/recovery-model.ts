import type { CalendarInvalidation } from "@zilobase/features/calendar";
export function calendarRecoveryDelay(healthy: boolean, failures = 0, random = Math.random()) {
  return (
    Math.min(300_000, (healthy ? 300_000 : 60_000) * 2 ** Math.min(failures, 3)) *
    (0.9 + random * 0.2)
  );
}
export function validCalendarInvalidation(
  value: unknown,
  scope: { workspaceId: string; bindingId: string },
): value is CalendarInvalidation {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    e.type === "calendar.invalidate" &&
    e.workspaceId === scope.workspaceId &&
    e.bindingId === scope.bindingId &&
    typeof e.calendarId === "string" &&
    [e.revision, e.generation].every((value) => Number.isSafeInteger(value) && Number(value) >= 0)
  );
}
export function calendarPushHealthy(lastPong: number, watchExpiresAt: number, now = Date.now()) {
  return lastPong > 0 && now - lastPong < 45_000 && watchExpiresAt > now;
}
