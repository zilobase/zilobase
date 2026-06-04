import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  Loader2Icon,
  PlugIcon,
  RotateCwIcon,
} from "lucide-react";

import type { IntegrationStatus, IntegrationSummary } from "./types";

export function RefreshIntegrationsCard({
  isLoading,
  onRefresh,
}: {
  isLoading: boolean;
  onRefresh: () => void;
}) {
  return (
    <Card>
      <CardHeader className="items-start gap-4 sm:flex-row sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Connections</CardTitle>
          <CardDescription>
            Review connected tools and refresh their current status.
          </CardDescription>
        </div>
        <Button
          disabled={isLoading}
          onClick={onRefresh}
          size="sm"
          type="button"
          variant="outline"
        >
          {isLoading ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <RotateCwIcon />
          )}
          Refresh
        </Button>
      </CardHeader>
    </Card>
  );
}

export function IntegrationSection({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-2">{children}</ItemGroup>
      </CardContent>
    </Card>
  );
}

export function IntegrationGridCard({
  integration,
}: {
  integration: IntegrationSummary;
}) {
  const isConnected = integration.connected === true;

  return (
    <Item className="min-h-16" variant="outline">
      <ItemMedia className="size-10 rounded-lg border bg-background">
        <img
          alt=""
          aria-hidden="true"
          className="size-5"
          src={integration.icon}
        />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ItemTitle className="truncate">{integration.name}</ItemTitle>
          <ConnectionBadge
            connected={integration.connected}
            status={integration.status}
          />
        </div>
        <ItemDescription className="line-clamp-2">
          {integration.detail}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          disabled={isConnected || integration.connectDisabled}
          onClick={integration.onConnect}
          size="sm"
          type="button"
          variant={isConnected ? "secondary" : "default"}
        >
          {integration.isBusy ? (
            <Loader2Icon className="animate-spin" />
          ) : isConnected ? (
            <CheckCircle2Icon />
          ) : (
            <PlugIcon />
          )}
          {isConnected ? "Connected" : integration.connectLabel}
        </Button>
        <Button
          onClick={integration.onManage}
          size="sm"
          type="button"
          variant="outline"
        >
          Manage
        </Button>
      </ItemActions>
    </Item>
  );
}

export function IntegrationDetailShell({
  children,
  integration,
  onBack,
}: {
  children: React.ReactNode;
  integration: IntegrationSummary;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button onClick={onBack} size="sm" type="button" variant="ghost">
          <ArrowLeftIcon />
          Integrations
        </Button>
      </div>
      <div className="space-y-4">
        <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground shadow-xs md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-md border bg-background">
              <img
                alt=""
                aria-hidden="true"
                className="size-6"
                src={integration.icon}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium">{integration.name}</h3>
                <ConnectionBadge
                  connected={integration.connected}
                  status={integration.status}
                />
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {integration.about}
              </p>
            </div>
          </div>
          <Badge variant="outline">{integration.category}</Badge>
        </div>
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-medium">Connection details</h4>
            <p className="text-sm text-muted-foreground">
              Review account information, permissions, and any available
              settings for this integration.
            </p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function ConnectionBadge({
  connected,
  status,
}: {
  connected?: boolean;
  status?: IntegrationStatus | null;
}) {
  if (!status) {
    if (connected === undefined) {
      return <Badge variant="secondary">Loading</Badge>;
    }

    return connected ? (
      <Badge className="gap-1" variant="secondary">
        <CheckCircle2Icon className="size-3" />
        Connected
      </Badge>
    ) : (
      <Badge variant="secondary">Disconnected</Badge>
    );
  }

  if (!status.connected) {
    return <Badge variant="secondary">Disconnected</Badge>;
  }

  return (
    <Badge className="gap-1" variant="secondary">
      <CheckCircle2Icon className="size-3" />
      Connected
    </Badge>
  );
}

export function IntegrationDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-background px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 min-w-0 truncate">{value}</div>
    </div>
  );
}
