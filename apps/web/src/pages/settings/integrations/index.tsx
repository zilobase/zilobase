"use client";

import * as React from "react";
import {
  useDisconnectIntegration,
  useIntegrations,
  useStartIntegrationOAuth,
  type ToolkitConnectedAccount,
  type ToolkitConnector,
} from "@zilobase/features/integrations";
import {
  CheckCircle2Icon,
  Loader2Icon,
  PlugIcon,
  RotateCwIcon,
  UnplugIcon,
} from "lucide-react";
import { toast } from "sonner";

import { SettingsHeader } from "@/components/settings-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getApiErrorMessage } from "@/lib/api";
import { integrationIcons } from "@/lib/integration-icons";

export default function WorkspaceIntegrationsSettingsPage() {
  const integrations = useIntegrations();
  const startOAuth = useStartIntegrationOAuth();
  const disconnect = useDisconnectIntegration();

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get("oauth");

    if (!oauthStatus) {
      return;
    }

    const connector = params.get("connector") || "Integration";
    const message = params.get("message");

    if (oauthStatus === "success") {
      toast.success(message || `${humanize(connector)} connected.`);
      void integrations.refetch();
    } else {
      toast.error(message || `${humanize(connector)} connection failed.`);
    }

    for (const key of [
      "oauth",
      "connector",
      "connection_id",
      "error",
      "message",
      "provider",
    ]) {
      params.delete(key);
    }

    const search = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`,
    );
  }, [integrations]);

  const connect = React.useCallback(
    async (connectorId: string) => {
      const popup = openToolkitPopup();

      try {
        const connection = await startOAuth.mutateAsync({ id: connectorId });
        if (!popup) {
          window.location.assign(connection.url);
          return;
        }

        popup.location.assign(connection.url);
        popup.focus();
        await waitForPopupClose(popup);
        await integrations.refetch();
      } catch (error) {
        popup?.close();
        toast.error(getApiErrorMessage(error));
      }
    },
    [integrations, startOAuth],
  );

  const remove = React.useCallback(
    async (connectorId: string) => {
      try {
        await disconnect.mutateAsync(connectorId);
        toast.success(`${humanize(connectorId)} disconnected.`);
      } catch (error) {
        toast.error(getApiErrorMessage(error));
      }
    },
    [disconnect],
  );

  const data = integrations.data;

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        description="Connect accounts through Toolkit so Zilobase chat can use their read-only tools."
        title="Integrations"
      />
      <div className="mx-auto grid w-full max-w-4xl gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h3 className="font-heading text-base leading-snug font-medium">
              Connected services
            </h3>
            <p className="text-sm text-muted-foreground">
              Connections are private to you and the active Zilobase workspace.
            </p>
          </div>
          <Button
            disabled={integrations.isFetching}
            onClick={() => void integrations.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            {integrations.isFetching ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <RotateCwIcon />
            )}
            Refresh
          </Button>
        </div>

        {integrations.error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {getApiErrorMessage(integrations.error)}
            </AlertDescription>
          </Alert>
        ) : null}

        {data && !data.configured ? (
          <Alert variant="destructive">
            <AlertDescription>
              Toolkit is not configured for this Zilobase deployment.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card className="gap-0 overflow-hidden py-0">
          <CardContent className="divide-y p-0">
            {integrations.isLoading ? (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                Loading Toolkit connectors…
              </div>
            ) : data?.connectors.length ? (
              data.connectors.map((connector) => (
                <ConnectorRow
                  accounts={data.accounts.filter(
                    (account) => account.connectorId === connector.id,
                  )}
                  connector={connector}
                  disconnecting={
                    disconnect.isPending &&
                    readDisconnectId(disconnect.variables) === connector.id
                  }
                  key={connector.id}
                  onConnect={() => void connect(connector.id)}
                  onDisconnect={() => void remove(connector.id)}
                  starting={
                    startOAuth.isPending &&
                    startOAuth.variables?.id === connector.id
                  }
                />
              ))
            ) : (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                No Toolkit connectors are available.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function ConnectorRow({
  accounts,
  connector,
  disconnecting,
  onConnect,
  onDisconnect,
  starting,
}: {
  accounts: ToolkitConnectedAccount[];
  connector: ToolkitConnector;
  disconnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  starting: boolean;
}) {
  const activeAccounts = accounts.filter((account) => account.status === "active");
  const connected = activeAccounts.length > 0;
  const icon = connectorIcon(connector);

  return (
    <div className="flex min-h-20 items-center gap-3 px-4 py-3 hover:bg-sidebar-accent">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background">
        {icon ? (
          <img alt="" aria-hidden="true" className="size-5" src={icon} />
        ) : (
          <PlugIcon className="size-5 text-muted-foreground" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{connector.name}</span>
          <Badge className="gap-1" variant="secondary">
            {connected ? <CheckCircle2Icon className="size-3" /> : null}
            {connected ? "Connected" : "Disconnected"}
          </Badge>
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {connected
            ? `${activeAccounts.length} connected account${activeAccounts.length === 1 ? "" : "s"}. ${connector.description}`
            : connector.description}
        </p>
      </div>
      {connected ? (
        <Button
          disabled={disconnecting}
          onClick={onDisconnect}
          size="sm"
          type="button"
          variant="outline"
        >
          {disconnecting ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <UnplugIcon />
          )}
          Disconnect
        </Button>
      ) : (
        <Button
          disabled={starting}
          onClick={onConnect}
          size="sm"
          type="button"
        >
          {starting ? <Loader2Icon className="animate-spin" /> : <PlugIcon />}
          Connect
        </Button>
      )}
    </div>
  );
}

function connectorIcon(connector: ToolkitConnector) {
  if (connector.logoUrl) {
    return connector.logoUrl;
  }

  const key = connector.id === "google-calendar"
    ? "googleCalendar"
    : connector.id === "google-drive"
      ? "googleDrive"
      : connector.id;

  return key in integrationIcons
    ? integrationIcons[key as keyof typeof integrationIcons]
    : undefined;
}

function readDisconnectId(input: unknown) {
  return typeof input === "string"
    ? input
    : input && typeof input === "object" && "id" in input
      ? String(input.id)
      : null;
}

function humanize(value: string) {
  const text = value.replace(/[._-]+/g, " ").trim();
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : "Integration";
}

function openToolkitPopup() {
  const width = 520;
  const height = 720;
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
  const popup = window.open(
    "about:blank",
    "zilobase-toolkit-connection",
    `popup=yes,width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)}`,
  );

  if (popup) {
    popup.document.title = "Opening Toolkit";
    popup.document.body.style.cssText =
      "margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#fafafa;font:14px system-ui,sans-serif";
    popup.document.body.textContent = "Opening Toolkit…";
  }

  return popup;
}

function waitForPopupClose(popup: Window) {
  return new Promise<void>((resolve) => {
    const timer = window.setInterval(() => {
      if (!popup.closed) return;
      window.clearInterval(timer);
      resolve();
    }, 400);
  });
}
