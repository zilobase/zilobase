import { useState } from "react"
import {
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from "../components/settings-layout"
import { CalendarConnectButton } from "@/features/calendar/connections/calendar-connect-button"
import { useCalendarAccounts } from "@/features/calendar/connections/use-calendar-accounts"
import { CalendarSettings } from "@/features/calendar/preferences/calendar-settings"
import { RemovedCalendars } from "@/features/calendar/preferences/removed-calendars"
import { useCalendarPreferences } from "@/features/calendar/preferences/use-calendar-preferences"
import { getApiErrorMessage } from "@/platform/network/api"
import { Button } from "@/shared/ui/button"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
import { Separator } from "@/shared/ui/separator"
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react"

export default function CalendarSettingsPage() {
  const workspaceId = useActiveWorkspaceId()

  return (
    <SettingsPage
      description="Connect Google Calendar and choose how your schedule appears."
      title="Calendar"
    >
      {workspaceId ? (
        <CalendarWorkspaceSettings workspaceId={workspaceId} />
      ) : (
        <p className="text-sm text-content-secondary">
          Select a workspace to manage Calendar.
        </p>
      )}
    </SettingsPage>
  )
}

function CalendarWorkspaceSettings({ workspaceId }: { workspaceId: string }) {
  const { accounts, connect, disconnect } = useCalendarAccounts(workspaceId)
  const preferences = useCalendarPreferences(workspaceId)
  const [disconnectId, setDisconnectId] = useState<string | null>(null)
  const connections = accounts.data?.connections ?? []

  return (
    <>
      <SettingsSection
        description="Connected calendars stay private to you in this workspace."
        title="Google Calendar accounts"
      >
        {accounts.error ? (
          <p className="text-xs text-feedback-danger-text">{getApiErrorMessage(accounts.error)}</p>
        ) : null}
        {connections.length === 0 ? (
          <p className="text-sm text-content-secondary">No calendar account is connected yet.</p>
        ) : (
          <div className="grid gap-1">
            {connections.map((connection) => (
              <SettingsRow
                action={<Button
                  disabled={disconnect.isPending}
                  onClick={() => setDisconnectId(connection.bindingId)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Disconnect
                </Button>}
                description={connection.status}
                key={connection.bindingId}
                title={connection.email}
              />
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <CalendarConnectButton accounts={accounts} connect={connect} />
        </div>
      </SettingsSection>
      <Separator />
      {preferences.query.data ? (
        <CalendarSettings
          key={preferences.query.dataUpdatedAt}
          onSave={(value) => preferences.save.mutate(value)}
          pending={preferences.pending}
          value={preferences.query.data}
        />
      ) : preferences.query.error ? (
        <p className="text-sm text-feedback-danger-text">{getApiErrorMessage(preferences.query.error)}</p>
      ) : (
        <p className="text-sm text-content-secondary">Loading calendar preferences…</p>
      )}
      <RemovedCalendars workspaceId={workspaceId} />
      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !disconnect.isPending) setDisconnectId(null)
        }}
        open={Boolean(disconnectId)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect calendar account?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the account from this workspace. Events remain in Google Calendar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnect.isPending}>Cancel</AlertDialogCancel>
            <Button
              disabled={disconnect.isPending || !disconnectId}
              onClick={() => {
                if (!disconnectId) return
                disconnect.mutate(disconnectId, { onSuccess: () => setDisconnectId(null) })
              }}
              type="button"
              variant="destructive"
            >
              {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
