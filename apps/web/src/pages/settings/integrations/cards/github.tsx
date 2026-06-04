import * as React from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { GithubIntegrationStatus } from "@/features/integrations/queries";
import { integrationIcons } from "@/lib/integration-icons";
import { Loader2Icon, PlugIcon, UnplugIcon } from "lucide-react";

import { ConnectionBadge, IntegrationDetail } from "../components";

export function GithubIntegrationCard({
  canManageWorkspace,
  githubOrganizationLogin,
  isBusy,
  onConnectPersonal,
  onConnectWorkspace,
  onDisconnectPersonal,
  onDisconnectWorkspace,
  onOrganizationLoginChange,
  onToggleEmailMatch,
  status,
}: {
  canManageWorkspace: boolean;
  githubOrganizationLogin: string;
  isBusy: boolean;
  onConnectPersonal: () => void;
  onConnectWorkspace: (input: {
    enforceEmailMatch: boolean;
    organizationLogin: string;
  }) => void;
  onDisconnectPersonal: () => void;
  onDisconnectWorkspace: () => void;
  onOrganizationLoginChange: (value: string) => void;
  onToggleEmailMatch: (enabled: boolean) => void;
  status: GithubIntegrationStatus | null;
}) {
  const isWorkspaceConnected = status?.workspace.connected === true;
  const isPersonalConnected = status?.personal.connected === true;
  const [pendingEmailMatch, setPendingEmailMatch] = React.useState(true);
  const enforceEmailMatch = isWorkspaceConnected
    ? status?.workspace.enforceEmailMatch === true
    : pendingEmailMatch;
  const organizationLogin =
    status?.workspace.organizationLogin || githubOrganizationLogin;
  const canConnectWorkspace = organizationLogin.trim().length > 0;

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
                src={integrationIcons.github}
              />
            </div>
            <div className="min-w-0 space-y-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-medium">GitHub organization</h4>
                  <ConnectionBadge connected={status?.workspace.connected} />
                </div>
                <p className="max-w-xl text-sm text-muted-foreground">
                  Admin-managed GitHub organization connection for repository,
                  issue, pull request, commit, and file context.
                </p>
              </div>
              {!isWorkspaceConnected && canManageWorkspace ? (
                <div className="max-w-sm space-y-1.5">
                  <label
                    className="text-sm font-medium"
                    htmlFor="github-organization-login"
                  >
                    Organization login
                  </label>
                  <Input
                    disabled={isBusy}
                    id="github-organization-login"
                    onChange={(event) =>
                      onOrganizationLoginChange(event.target.value)
                    }
                    placeholder="acme-inc"
                    value={githubOrganizationLogin}
                  />
                </div>
              ) : null}
              <div className="grid gap-2 text-sm md:grid-cols-2">
                <IntegrationDetail
                  label="Organization"
                  value={
                    status?.workspace.organizationLogin ||
                    status?.workspace.organizationName ||
                    "Not connected"
                  }
                />
                <IntegrationDetail
                  label="Organization ID"
                  value={status?.workspace.organizationId || "Not connected"}
                />
                <IntegrationDetail
                  label="Email matching"
                  value={enforceEmailMatch ? "Required" : "Not required"}
                />
                <IntegrationDetail
                  label="Access"
                  value={
                    isWorkspaceConnected
                      ? "Organization verified"
                      : "Not connected"
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
                    !canConnectWorkspace ||
                    status?.configured === false ||
                    status?.needsMigration === true
                  }
                  onClick={() =>
                    onConnectWorkspace({
                      enforceEmailMatch,
                      organizationLogin,
                    })
                  }
                  type="button"
                >
                  {isBusy ? <Loader2Icon className="animate-spin" /> : <PlugIcon />}
                  Connect organization
                </Button>
              )}
            </div>
          ) : null}
        </div>
        <div className="mt-4 flex items-center justify-between gap-4 rounded-md border bg-background px-3 py-2">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">Require matching email</div>
            <div className="text-xs text-muted-foreground">
              Members must connect a GitHub account using their Notelab
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
        {!isWorkspaceConnected && !canManageWorkspace ? (
          <Alert className="mt-4">
            <AlertDescription>
              GitHub organization is not connected. Ask an admin to connect it
              before linking your GitHub account.
            </AlertDescription>
          </Alert>
        ) : null}
        {status?.configured === false ? (
          <Alert className="mt-4" variant="destructive">
            <AlertDescription>
              GitHub OAuth is not configured on the backend.
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
                src={integrationIcons.github}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-medium">My GitHub account</h4>
                  <ConnectionBadge connected={status?.personal.connected} />
                </div>
                <p className="max-w-xl text-sm text-muted-foreground">
                  Connect your GitHub identity so Notelab can verify you belong
                  to the connected GitHub organization.
                </p>
              </div>
              <div className="grid gap-2 text-sm md:grid-cols-2">
                <IntegrationDetail
                  label="Account"
                  value={
                    status?.personal.login ||
                    status?.personal.name ||
                    "Not connected"
                  }
                />
                <IntegrationDetail
                  label="Email"
                  value={status?.personal.email || "Not connected"}
                />
                <IntegrationDetail
                  label="Organization"
                  value={
                    status?.workspace.organizationLogin ||
                    status?.workspace.organizationName ||
                    "Organization not connected"
                  }
                />
                <IntegrationDetail
                  label="Access"
                  value={
                    isPersonalConnected
                      ? "GitHub identity linked"
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
              GitHub organization is not connected yet.
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
