import { useEffect, useId } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"

import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Label } from "@/shared/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"

import { calendarSelectionKey } from "./calendar-selection"
import {
  calendarSourcesQueryKey,
  useCalendarAccounts,
} from "./use-calendar-accounts"
import { useCalendarCatalog } from "./use-calendar-catalog"
import { useCalendarPreferences } from "../preferences/use-calendar-preferences"
import { requestCalendarNotificationPermission } from "../reminders/notification-delivery"

export function CalendarConnectionStatus({
  workspaceId,
}: {
  workspaceId: string
}) {
  const search = useSearch({ from: "/app/calendar" })
  const navigate = useNavigate()
  const client = useQueryClient()
  const { accounts, connect } = useCalendarAccounts(workspaceId)
  const preferences = useCalendarPreferences(workspaceId)
  const catalog = useCalendarCatalog(
    search.connection === "success" ? accounts.data?.connections ?? [] : [],
  )

  useEffect(() => {
    if (search.connection) {
      void client.invalidateQueries({ queryKey: calendarSourcesQueryKey })
    }
  }, [search.connection, client])

  if (!search.connection) return null

  const dismiss = () =>
    void navigate({
      to: "/calendar",
      search: {
        ...search,
        connection: undefined,
        workspace: undefined,
      },
      replace: true,
    })
  const connected = search.connection === "success"

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) dismiss()
      }}
    >
      <DialogContent
        aria-label="Calendar connection result"
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>
            {connected
              ? "Google Calendar connected"
              : "Calendar connection cancelled"}
          </DialogTitle>
          <DialogDescription>
            {connected
              ? "Choose your default calendar and reminder preferences."
              : "Your existing calendars are unchanged."}
          </DialogDescription>
        </DialogHeader>

        {connected ? (
          <ConnectedCalendarSetup
            catalog={catalog}
            preferences={preferences}
            value={preferences.query.data}
          />
        ) : null}

        <DialogFooter>
          {!connected ? (
            <Button
              disabled={connect.isPending}
              onClick={() => connect.mutate()}
              type="button"
              variant="outline"
            >
              Try again
            </Button>
          ) : null}
          <Button onClick={dismiss} type="button">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConnectedCalendarSetup({
  catalog,
  preferences,
  value,
}: {
  catalog: ReturnType<typeof useCalendarCatalog>
  preferences: ReturnType<typeof useCalendarPreferences>
  value: ReturnType<typeof useCalendarPreferences>["query"]["data"]
}) {
  const selectId = useId()

  return (
    <div className="grid gap-4">
      {value ? (
        <div className="grid gap-2">
          <Label htmlFor={selectId}>Default calendar</Label>
          <Select
            disabled={preferences.pending}
            onValueChange={(defaultCalendarKey) =>
              preferences.save.mutate({ ...value, defaultCalendarKey })
            }
            value={value.defaultCalendarKey ?? ""}
          >
            <SelectTrigger className="w-full" id={selectId}>
              <SelectValue placeholder="Choose a calendar" />
            </SelectTrigger>
            <SelectContent>
              {catalog.calendars
                .filter((calendar) => calendar.permissions.write)
                .map((calendar) => {
                  const key = calendarSelectionKey(
                    calendar.bindingId,
                    calendar.id,
                  )

                  return (
                    <SelectItem key={key} value={key}>
                      {calendar.name}
                    </SelectItem>
                  )
                })}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <p className="text-content-secondary">
          Loading calendar preferences…
        </p>
      )}

      {value && !value.remindersEnabled ? (
        <Button
          disabled={preferences.pending}
          onClick={() => {
            preferences.save.mutate({ ...value, remindersEnabled: true })
            void requestCalendarNotificationPermission().catch(() => {})
          }}
          type="button"
          variant="outline"
        >
          Enable meeting reminders
        </Button>
      ) : null}

      <p className="text-content-secondary">
        You can change these choices in Calendar settings. System notifications
        are optional.
      </p>
    </div>
  )
}
