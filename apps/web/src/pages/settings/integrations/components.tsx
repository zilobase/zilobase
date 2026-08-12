import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
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
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <h3 className="font-heading text-base leading-snug font-medium">
          Connections
        </h3>
        <p className="text-sm text-muted-foreground">
          Review connected tools and refresh their current status.
        </p>
      </div>
      <Button
        disabled={isLoading}
        onClick={onRefresh}
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
    </div>
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
    <section className="grid gap-3">
      <div className="min-w-0 space-y-1">
        <h3 className="font-heading text-base leading-snug font-medium">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="p-0">
          <div className="divide-y divide-border">{children}</div>
        </CardContent>
      </Card>
    </section>
  );
}

export function IntegrationGridCard({
  integration,
  isFirst,
  isLast,
}: {
  integration: IntegrationSummary;
  isFirst: boolean;
  isLast: boolean;
}) {
  const isConnected = integration.connected === true;

  return (
    <div
      className={cn(
        "flex min-h-16 items-center gap-3 px-4 py-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isFirst && "rounded-t-none",
        isLast && "rounded-b-none",
      )}
    >
      <span className="flex size-5 shrink-0 items-center justify-center">
        <img
          alt=""
          aria-hidden="true"
          className="size-5"
          src={integration.icon}
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-medium">{integration.name}</span>
          <ConnectionBadge
            connected={integration.connected}
            status={integration.status}
          />
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {integration.detail}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          disabled={isConnected || integration.connectDisabled}
          onClick={integration.onConnect}
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
          type="button"
          variant="outline"
        >
          Manage
        </Button>
      </div>
    </div>
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
        <Button onClick={onBack} type="button" variant="ghost">
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
