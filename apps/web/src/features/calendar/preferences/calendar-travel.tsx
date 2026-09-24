import { useEffect, useMemo, useRef, useState } from "react";
import { calendarTravelPreferences, type CalendarPreferences } from "@zilobase/features/calendar";
import { useCalendarWorkspace } from "../workspace/calendar-workspace";
import { Button } from "@/shared/ui/button";
import { CalendarZonePicker } from "./calendar-zone-picker";
import { CommandDialog } from "@/shared/ui/command";
export function useCalendarDisplayPreferences(value: CalendarPreferences) {
  const { travelZone } = useCalendarWorkspace();
  return useMemo(() => calendarTravelPreferences(value, travelZone), [value, travelZone]);
}
export function CalendarTravel({
  preferences,
}: {
  preferences: CalendarPreferences;
  onSave?: (preferences: CalendarPreferences) => Promise<unknown>;
}) {
  const { setTravelZone, travelPickerOpen, setTravelPickerOpen } = useCalendarWorkspace();
  const [suggested, setSuggested] = useState<string | null>(null);
  const previousSystemZone = useRef(Intl.DateTimeFormat().resolvedOptions().timeZone);
  useEffect(() => {
    const check = () => {
      const current = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (
        preferences.promptTimeZoneChanges &&
        current !== previousSystemZone.current &&
        current !== preferences.timeZone
      )
        setSuggested(current);
      previousSystemZone.current = current;
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [preferences.promptTimeZoneChanges, preferences.timeZone]);
  return (
    <>
      {suggested && (
        <div
          role="status"
          className="absolute right-4 top-12 z-30 rounded bg-surface-overlay p-3 text-sm"
        >
          Your system time zone changed to {suggested}.
          <Button
            variant="ghost"
            onClick={() => {
              setSuggested(null);
              setTravelPickerOpen(true);
            }}
          >
            Choose time zone
          </Button>
          <Button variant="ghost" onClick={() => setSuggested(null)}>
            Dismiss
          </Button>
        </div>
      )}
      <CommandDialog
        open={travelPickerOpen}
        onOpenChange={setTravelPickerOpen}
        title="Travel to a time zone"
        description="Temporarily display your schedule in another time zone."
      >
        <CalendarZonePicker
          onSelect={(zone) => {
            setTravelZone(zone);
            setTravelPickerOpen(false);
          }}
        />
      </CommandDialog>
    </>
  );
}
