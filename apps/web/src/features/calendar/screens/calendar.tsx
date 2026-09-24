import { CalendarConnectionStatus } from "../connections/calendar-connection-status";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { useSetActiveWorkspace } from "@zilobase/features/workspaces/react";
import { useRef } from "react";
import { CalendarToolbar } from "../workspace/calendar-toolbar";
import { useCalendarWorkspace } from "../workspace/calendar-workspace";
import { RemovedCalendars } from "../preferences/removed-calendars";
import type { CalendarConnection, CalendarPreferences } from "@zilobase/features/calendar";
import { CalendarSchedule } from "../views/calendar-schedule";
import { useSession } from "@zilobase/features/auth/react";
import { CalendarConnectButton } from "../connections/calendar-connect-button";
import { GoogleIcon } from "@/shared/components/google-icon";
import {
  MainPaneHeaderLeadingControl,
  PagePaneHeader,
} from "@/features/pages/pane/page-pane-header";
import { PageSidePaneHeaderCell, PageSidePaneShell } from "@/features/pages/pane/page-side-pane";
import { useEffect, useState } from "react";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/dialog";
import { Skeleton } from "@/shared/ui/skeleton";
import { SettingsIcon } from "@/shared/components/icons";
import { getApiErrorMessage } from "@/platform/network/api";
import { useCalendarAccounts } from "../connections/use-calendar-accounts";
import { useCalendarPreferences } from "../preferences/use-calendar-preferences";
import { CalendarSettings } from "../preferences/calendar-settings";
export default function CalendarScreen() {
  const workspaceId = useActiveWorkspaceId();
  const search = useSearch({ from: "/app/calendar" }),
    navigate = useNavigate();
  const switchWorkspace = useSetActiveWorkspace(),
    attempted = useRef<string | null>(null);
  const target = search.connection ? search.workspace : undefined;
  useEffect(() => {
    if (!target || target === workspaceId || attempted.current === target) return;
    attempted.current = target;
    switchWorkspace.mutate(target);
  }, [target, workspaceId, switchWorkspace.mutate]);
  if (target && target !== workspaceId)
    return (
      <div className="grid gap-3 p-6" role="status">
        <p>
          {switchWorkspace.error
            ? getApiErrorMessage(switchWorkspace.error)
            : "Returning to your calendar workspace…"}
        </p>
        {switchWorkspace.error && (
          <>
            <Button onClick={() => switchWorkspace.mutate(target)}>Retry</Button>
            <Button
              variant="outline"
              onClick={() => void navigate({ to: "/calendar", search: {} })}
            >
              Open current workspace
            </Button>
          </>
        )}
      </div>
    );
  return workspaceId ? (
    <CalendarWorkspace key={workspaceId} workspaceId={workspaceId} />
  ) : (
    <p className="p-6 text-content-secondary">Select a workspace to open Calendar.</p>
  );
}
function CalendarWorkspace({ workspaceId }: { workspaceId: string }) {
  const { data: session } = useSession();
  const { accounts, connect } = useCalendarAccounts(workspaceId),
    preferences = useCalendarPreferences(workspaceId);
  const [settings, setSettings] = useState(false);
  const { reset } = useCalendarWorkspace();
  useEffect(() => reset, [reset]);
  return (
    <PageSidePaneShell
      className="h-full bg-surface-canvas"
      open={false}
      visible={false}
      header={
        <PageSidePaneHeaderCell className="z-10" side="main" splitActive={false}>
          <PagePaneHeader
            className="min-w-0 flex-1"
            leadingControl={<MainPaneHeaderLeadingControl />}
            pathname="/calendar"
            actions={
              preferences.query.data ? (
                <CalendarToolbar
                  onPreferences={(data) => preferences.save.mutateAsync(data)}
                  preferences={preferences.query.data}
                  onSettings={() => setSettings(true)}
                />
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Calendar settings"
                  onClick={() => setSettings(true)}
                >
                  <SettingsIcon />
                </Button>
              )
            }
          />
        </PageSidePaneHeaderCell>
      }
      body={
        <section
          className="flex h-full min-h-0 flex-1 flex-col bg-surface-canvas text-content-primary"
          aria-label="Calendar"
        >
          <CalendarConnectionStatus workspaceId={workspaceId} />
          {accounts.isPending ? (
            <div className="p-6">
              <Skeleton className="h-24 w-full" />
            </div>
          ) : accounts.error ? (
            <div role="alert" className="p-6">
              <p>{getApiErrorMessage(accounts.error)}</p>
              <Button variant="outline" onClick={() => void accounts.refetch()}>
                Retry
              </Button>
            </div>
          ) : !accounts.data?.connections.length ? (
            <main className="grid min-h-0 flex-1 place-items-center px-6">
              <section className="flex max-w-md flex-col items-center gap-5 py-12 text-center">
                <GoogleIcon className="size-7" />
                <div className="space-y-1">
                  <h1 className="text-lg font-semibold">Connect your Google Calendar</h1>
                  <p className="max-w-sm text-sm leading-6 text-content-secondary">
                    See your schedule and manage events from Zilobase. Your calendars stay private
                    to you.
                  </p>
                </div>
                <CalendarConnectButton accounts={accounts} connect={connect} />
              </section>
            </main>
          ) : (
            <CalendarScheduleContent
              workspaceId={workspaceId}
              connections={accounts.data.connections}
              preferences={preferences.query.data}
              error={preferences.query.error}
              userId={session?.user?.id}
            />
          )}
          <Dialog open={settings} onOpenChange={setSettings}>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogTitle>Calendar settings</DialogTitle>
              {preferences.query.data ? (
                <CalendarSettings
                  key={preferences.query.dataUpdatedAt}
                  value={preferences.query.data}
                  pending={preferences.pending}
                  onSave={(data) =>
                    preferences.save.mutate(data, { onSuccess: () => setSettings(false) })
                  }
                />
              ) : (
                <p>Loading preferences…</p>
              )}
              <RemovedCalendars workspaceId={workspaceId} />
            </DialogContent>
          </Dialog>
        </section>
      }
    />
  );
}

function CalendarScheduleContent({
  workspaceId,
  connections = [],
  preferences,
  userId,
  error,
}: {
  workspaceId: string;
  connections?: CalendarConnection[];
  preferences?: CalendarPreferences;
  userId?: string;
  error: unknown;
}) {
  if (error)
    return (
      <p role="alert" className="p-6 text-feedback-danger-text">
        {getApiErrorMessage(error)}
      </p>
    );
  if (!preferences)
    return <p className="p-6 text-content-secondary">Loading calendar preferences…</p>;
  if (!connections.length || !userId)
    return (
      <main className="grid flex-1 place-items-center p-6 text-sm text-content-secondary">
        Connect a calendar to see your schedule.
      </main>
    );
  return (
    <CalendarSchedule
      preferenceWorkspaceId={workspaceId}
      connections={connections}
      userId={userId}
      preferences={preferences}
    />
  );
}
