import type { CalendarPreferences, CalendarRecord } from "@zilobase/features/calendar";
export const calendarSelectionKey = (bindingId: string, calendarId: string) =>
  JSON.stringify([bindingId, calendarId]);

export type CalendarSelectionMatcher = {
  isVisible: (bindingId: string, calendarId: string) => boolean;
  isRemoved: (bindingId: string, calendarId: string) => boolean;
};

const buildCalendarKeySet = (keys: readonly string[] | undefined) => new Set(keys ?? []);

export function createCalendarSelectionMatcher(
  preferences: CalendarPreferences,
): CalendarSelectionMatcher {
  const hidden = buildCalendarKeySet(preferences.hiddenCalendarKeys);
  const removed = buildCalendarKeySet(preferences.removedCalendarKeys);
  return {
    isRemoved: (bindingId, calendarId) => removed.has(calendarSelectionKey(bindingId, calendarId)),
    isVisible: (bindingId, calendarId) => {
      const key = calendarSelectionKey(bindingId, calendarId);
      return !hidden.has(key) && !removed.has(key);
    },
  };
}
export function calendarIsVisible(
  preferences: CalendarPreferences,
  bindingId: string,
  calendarId: string,
) {
  return createCalendarSelectionMatcher(preferences).isVisible(bindingId, calendarId);
}

export function resolveDefaultCalendar(
  calendars: CalendarRecord[],
  preferences: CalendarPreferences,
) {
  const matcher = createCalendarSelectionMatcher(preferences);
  const selected = calendars.reduce<{
    defaultCalendar?: CalendarRecord;
    firstBindingId?: string;
    fallback?: CalendarRecord;
    firstBindingPrimary?: CalendarRecord;
  }>((selection, calendar) => {
    if (!calendar.permissions.write || matcher.isRemoved(calendar.bindingId, calendar.id))
      return selection;
    if (preferences.defaultCalendarKey === calendarSelectionKey(calendar.bindingId, calendar.id)) {
      selection.defaultCalendar = calendar;
      return selection;
    }
    if (!selection.firstBindingId) selection.firstBindingId = calendar.bindingId;
    if (!selection.fallback) selection.fallback = calendar;
    if (
      !selection.firstBindingPrimary &&
      calendar.bindingId === selection.firstBindingId &&
      calendar.primary
    )
      selection.firstBindingPrimary = calendar;
    return selection;
  }, {});
  if (selected.defaultCalendar) return selected.defaultCalendar;
  return selected.firstBindingPrimary ?? selected.fallback;
}
