import * as React from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { GoogleCalendarIntegrationStatus } from "@/features/integrations/queries";
import { integrationIcons } from "@/lib/integration-icons";
import { Loader2Icon, PlugIcon, UnplugIcon } from "lucide-react";

import { ConnectionBadge, IntegrationDetail } from "../components";

export function GoogleCalendarIntegrationCard({
  canManageWorkspace,
  isBusy,
  onConnectPersonal,
  onConnectWorkspace,
  onDisconnectPersonal,
  onDisconnectWorkspace,
  onToggleCoworkerAccess,
  onToggleEmailMatch,
  status,
}: {
  canManageWorkspace: boolean;
  isBusy: boolean;
  onConnectPersonal: () => void;
  onConnectWorkspace: (input: {
    coworkerCalendarAccessEnabled: boolean;
    enforceEmailMatch: boolean;
  }) => void;
  onDisconnectPersonal: () => void;
  onDisconnectWorkspace: () => void;
  onToggleCoworkerAccess: (enabled: boolean) => void;
  onToggleEmailMatch: (enabled: boolean) => void;
  status: GoogleCalendarIntegrationStatus | null;
}) {
  const isWorkspaceConnected = status?.workspace.connected === true;
  const isPersonalConnected = status?.personal.connected === true;
  const [pendingEmailMatch, setPendingEmailMatch] = React.useState(true);
  const [pendingCoworkerAccess, setPendingCoworkerAccess] =
    React.useState(false);
  const enforceEmailMatch = isWorkspaceConnected
    ? status?.workspace.enforceEmailMatch === true
    : pendingEmailMatch;
  const coworkerAccessEnabled = isWorkspaceConnected
    ? status?.workspace.coworkerCalendarAccessEnabled === true
    : pendingCoworkerAccess;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-background">
              <img
                alt=""
                aria-hidden="true"
                className="size-5"
                src={integrationIcons.googleCalendar}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-medium">Google Calendar workspace</h4>
                  <ConnectionBadge connected={status?.workspace.connected} />
                </div>
                <p className="max-w-xl text-sm text-muted-foreground">
                  Admin-managed Google Workspace domain and calendar policy for
                  personal calendar accounts.
                </p>
              </div>
              <div className="grid gap-2 text-sm md:grid-cols-2">
                <IntegrationDetail
                  label="Domain"
                  value={status?.workspace.hostedDomain || "Not connected"}
                />
                <IntegrationDetail
                  label="Admin account"
                  value={status?.workspace.email || "Not connected"}
                />
                <IntegrationDetail
                  label="Email matching"
                  value={enforceEmailMatch ? "Required" : "Not required"}
                />
                <IntegrationDetail
                  label="Coworkers"
                  value={
                    coworkerAccessEnabled
                      ? "Availability enabled"
                      : "Personal calendar only"
                  }
                />
              </div>
            </div>
          </div>
          {canManageWorkspace ? (
            <div className="flex shrink-0 gap-2 md:justify-end">
              {isWorkspaceConnected ? (
                <Button
                  disabled={isBusy}
                  onClick={onDisconnectWorkspace}
                  type="button"
                  variant="destructive"
                >
                  {isBusy ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <UnplugIcon />
                  )}
                  Disconnect
                </Button>
              ) : (
                <Button
                  disabled={
                    isBusy ||
                    status?.configured === false ||
                    status?.needsMigration === true
                  }
                  onClick={() =>
                    onConnectWorkspace({
                      coworkerCalendarAccessEnabled: coworkerAccessEnabled,
                      enforceEmailMatch,
                    })
                  }
                  type="button"
                >
                  {isBusy ? <Loader2Icon className="animate-spin" /> : <PlugIcon />}
                  Connect workspace
                </Button>
              )}
            </div>
          ) : null}
        </div>
        <div className="mt-4 flex items-center justify-between gap-4 rounded-md border bg-background px-3 py-2">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">Require matching email</div>
            <div className="text-xs text-muted-foreground">
              Members must connect a Google account using their Notelab
              organization email.
            </div>
          </div>
          <Switch
            checked={enforceEmailMatch}
            disabled={isBusy || !canManageWorkspace}
            onCheckedChange={(checked) => {
              if (isWorkspaceConnected) {
                onToggleEmailMatch(checked);
              } else {
                setPendingEmailMatch(checked);
              }
            }}
          />
        </div>
        <div className="mt-4 flex items-center justify-between gap-4 rounded-md border bg-background px-3 py-2">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">
              Coworker calendar availability
            </div>
            <div className="text-xs text-muted-foreground">
              Allow AI to check free/busy blocks for other organization
              calendars.
            </div>
          </div>
          <Switch
            checked={coworkerAccessEnabled}
            disabled={isBusy || !canManageWorkspace}
            onCheckedChange={(checked) => {
              if (isWorkspaceConnected) {
                onToggleCoworkerAccess(checked);
              } else {
                setPendingCoworkerAccess(checked);
              }
            }}
          />
        </div>
        {!isWorkspaceConnected && !canManageWorkspace ? (
          <Alert className="mt-4">
            <AlertDescription>
              Google Calendar workspace is not connected. Ask an admin to
              connect it before linking your calendar account.
            </AlertDescription>
          </Alert>
        ) : null}
        {status?.configured === false ? (
          <Alert className="mt-4" variant="destructive">
            <AlertDescription>
              Google OAuth is not configured on the backend.
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-background">
              <img
                alt=""
                aria-hidden="true"
                className="size-5"
                src={integrationIcons.googleCalendar}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-medium">My Google Calendar account</h4>
                  <ConnectionBadge connected={status?.personal.connected} />
                </div>
                <p className="max-w-xl text-sm text-muted-foreground">
                  Connect your Calendar identity so AI can read events visible
                  to your Google account.
                </p>
              </div>
              <div className="grid gap-2 text-sm md:grid-cols-2">
                <IntegrationDetail
                  label="Account"
                  value={status?.personal.email || "Not connected"}
                />
                <IntegrationDetail
                  label="Domain"
                  value={status?.personal.hostedDomain || "Not verified"}
                />
                <IntegrationDetail
                  label="Workspace"
                  value={
                    status?.workspace.hostedDomain ||
                    "Workspace not connected"
                  }
                />
                <IntegrationDetail
                  label="Access"
                  value={
                    isPersonalConnected
                      ? "Calendar account linked"
                      : "Not connected"
                  }
                />
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-2 md:justify-end">
            {isPersonalConnected ? (
              <Button
                disabled={isBusy}
                onClick={onDisconnectPersonal}
                type="button"
                variant="destructive"
              >
                {isBusy ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <UnplugIcon />
                )}
                Disconnect
              </Button>
            ) : (
              <Button
                disabled={
                  isBusy ||
                  !isWorkspaceConnected ||
                  status?.configured === false ||
                  status?.needsMigration === true
                }
                onClick={onConnectPersonal}
                type="button"
              >
                {isBusy ? <Loader2Icon className="animate-spin" /> : <PlugIcon />}
                Connect account
              </Button>
            )}
          </div>
        </div>
        {!isWorkspaceConnected ? (
          <Alert className="mt-4">
            <AlertDescription>
              Google Calendar workspace is not connected yet.
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
