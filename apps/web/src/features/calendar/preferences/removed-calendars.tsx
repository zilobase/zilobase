import { useCalendarAccounts } from "../connections/use-calendar-accounts";
import { useCalendarCatalog } from "../connections/use-calendar-catalog";
import { calendarSelectionKey } from "../connections/calendar-selection";
import { useCalendarPreferences } from "./use-calendar-preferences";
import { Button } from "@/shared/ui/button";
import { SettingsRow, SettingsSectionLayout } from "@/features/settings";
export function RemovedCalendars({ workspaceId }: { workspaceId: string }) {
  const { accounts } = useCalendarAccounts(workspaceId),
    preferences = useCalendarPreferences(workspaceId);
  const catalog = useCalendarCatalog(accounts.data?.connections ?? []),
    value = preferences.query.data;
  const removed = catalog.calendars.filter((calendar) =>
    value?.removedCalendarKeys?.includes(calendarSelectionKey(calendar.bindingId, calendar.id)),
  );
  if (!value || !removed.length) return null;
  return (
    <SettingsSectionLayout
      className="border-t border-stroke-default pt-6"
      description="Restore calendars that were removed from your visible calendar list."
      title="Removed calendars"
    >
      {removed.map((calendar) => {
        const key = calendarSelectionKey(calendar.bindingId, calendar.id);
        return (
          <SettingsRow
            action={
              <Button
                size="sm"
                variant="outline"
                disabled={preferences.pending}
                onClick={() =>
                  preferences.save.mutate({
                    ...value,
                    removedCalendarKeys: value.removedCalendarKeys?.filter((id) => id !== key),
                    hiddenCalendarKeys: value.hiddenCalendarKeys.filter((id) => id !== key),
                  })
                }
              >
                Restore
              </Button>
            }
            description={
              accounts.data?.connections.find((account) => account.bindingId === calendar.bindingId)
                ?.email
            }
            key={key}
            title={calendar.name}
          />
        );
      })}
    </SettingsSectionLayout>
  );
}
