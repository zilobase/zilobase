import * as React from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2Icon, PlugIcon, UnplugIcon } from "lucide-react";

import { ConnectionBadge, IntegrationDetail } from "./components";

export type IntegrationAvailabilityStatus = {
  configured?: boolean;
  needsMigration?: boolean;
} | null;

export function isIntegrationConnectBlocked(
  status: IntegrationAvailabilityStatus,
) {
  return status?.configured === false || status?.needsMigration === true;
}

export function IntegrationSectionCard({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-xs">
      {children}
    </div>
  );
}

export function IntegrationSectionHeader({
  connected,
  description,
  details,
  extra,
  iconSrc,
  title,
}: {
  connected?: boolean;
  description: string;
  details?: React.ReactNode;
  extra?: React.ReactNode;
  iconSrc: string;
  title: string;
}) {
  return (
    <div className="flex min-w-0 gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-background">
        <img alt="" aria-hidden="true" className="size-5" src={iconSrc} />
      </div>
      <div className="min-w-0 space-y-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-medium">{title}</h4>
            <ConnectionBadge connected={connected} />
          </div>
          <p className="max-w-xl text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        {extra}
        {details ? (
          <div className="grid gap-2 text-sm md:grid-cols-2">{details}</div>
        ) : null}
      </div>
    </div>
  );
}

export function IntegrationSectionLayout({
  actions,
  children,
  footer,
}: {
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        {children}
        {actions}
      </div>
      {footer}
    </>
  );
}

export function IntegrationPageActions({
  canManagePage,
  connectDisabled = false,
  connectLabel,
  isBusy,
  isPageConnected,
  onConnectPage,
  onDisconnectPage,
}: {
  canManagePage: boolean;
  connectDisabled?: boolean;
  connectLabel: string;
  isBusy: boolean;
  isPageConnected: boolean;
  onConnectPage: () => void;
  onDisconnectPage: () => void;
}) {
  if (!canManagePage) {
    return null;
  }

  return (
    <div className="flex shrink-0 gap-2 md:justify-end">
      {isPageConnected ? (
        <Button
          disabled={isBusy}
          onClick={onDisconnectPage}
          type="button"
          variant="destructive"
        >
          {isBusy ? <Loader2Icon className="animate-spin" /> : <UnplugIcon />}
          Disconnect
        </Button>
      ) : (
        <Button
          disabled={isBusy || connectDisabled}
          onClick={onConnectPage}
          type="button"
        >
          {isBusy ? <Loader2Icon className="animate-spin" /> : <PlugIcon />}
          {connectLabel}
        </Button>
      )}
    </div>
  );
}

export function IntegrationConnectionButtons({
  connectDisabled = false,
  connectLabel = "Connect account",
  isBusy,
  isConnected,
  isPageConnected = true,
  onConnect,
  onDisconnect,
  requirePage = true,
  status,
}: {
  connectDisabled?: boolean;
  connectLabel?: string;
  isBusy: boolean;
  isConnected: boolean;
  isPageConnected?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  requirePage?: boolean;
  status?: IntegrationAvailabilityStatus;
}) {
  const blocked = isIntegrationConnectBlocked(status ?? null);

  return (
    <div className="flex shrink-0 gap-2 md:justify-end">
      {isConnected ? (
        <Button
          disabled={isBusy}
          onClick={onDisconnect}
          type="button"
          variant="destructive"
        >
          {isBusy ? <Loader2Icon className="animate-spin" /> : <UnplugIcon />}
          Disconnect
        </Button>
      ) : (
        <Button
          disabled={
            isBusy ||
            connectDisabled ||
            blocked ||
            (requirePage && !isPageConnected)
          }
          onClick={onConnect}
          type="button"
        >
          {isBusy ? <Loader2Icon className="animate-spin" /> : <PlugIcon />}
          {connectLabel}
        </Button>
      )}
    </div>
  );
}

export function IntegrationSettingToggle({
  checked,
  description,
  disabled,
  onCheckedChange,
  title,
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  title: string;
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-4 rounded-md border bg-background px-3 py-2">
      <div className="space-y-0.5">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

export function IntegrationEmailMatchSetting({
  canManagePage,
  checked,
  disabled,
  integrationName,
  isPageConnected,
  onApply,
  onPendingChange,
}: {
  canManagePage: boolean;
  checked: boolean;
  disabled?: boolean;
  integrationName: string;
  isPageConnected: boolean;
  onApply: (enabled: boolean) => void;
  onPendingChange: (enabled: boolean) => void;
}) {
  return (
    <IntegrationSettingToggle
      checked={checked}
      description={`Members must connect a ${integrationName} account using their Notelab workspace email.`}
      disabled={disabled || !canManagePage}
      onCheckedChange={(enabled) => {
        if (isPageConnected) {
          onApply(enabled);
        } else {
          onPendingChange(enabled);
        }
      }}
      title="Require matching email"
    />
  );
}

export function IntegrationPagePendingAlert({
  canManagePage,
  isPageConnected,
  memberMessage,
}: {
  canManagePage: boolean;
  isPageConnected: boolean;
  memberMessage: string;
}) {
  if (isPageConnected || canManagePage) {
    return null;
  }

  return (
    <Alert className="mt-4">
      <AlertDescription>{memberMessage}</AlertDescription>
    </Alert>
  );
}

export function IntegrationPageDisconnectedAlert({
  integrationName,
  isPageConnected,
}: {
  integrationName: string;
  isPageConnected: boolean;
}) {
  if (isPageConnected) {
    return null;
  }

  return (
    <Alert className="mt-4">
      <AlertDescription>
        {integrationName} is not connected yet.
      </AlertDescription>
    </Alert>
  );
}

export function IntegrationOAuthNotConfiguredAlert({
  message,
  status,
}: {
  message: string;
  status: IntegrationAvailabilityStatus;
}) {
  if (status?.configured !== false) {
    return null;
  }

  return (
    <Alert className="mt-4" variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function IntegrationPersonalAccountCard({
  description,
  details,
  iconSrc,
  integrationName,
  isBusy,
  isPersonalConnected,
  isPageConnected,
  onConnectPersonal,
  onDisconnectPersonal,
  status,
  title,
}: {
  description: string;
  details: React.ReactNode;
  iconSrc: string;
  integrationName: string;
  isBusy: boolean;
  isPersonalConnected: boolean;
  isPageConnected: boolean;
  onConnectPersonal: () => void;
  onDisconnectPersonal: () => void;
  status: IntegrationAvailabilityStatus;
  title: string;
}) {
  return (
    <IntegrationSectionCard>
      <IntegrationSectionLayout
        actions={
          <IntegrationConnectionButtons
            isBusy={isBusy}
            isConnected={isPersonalConnected}
            isPageConnected={isPageConnected}
            onConnect={onConnectPersonal}
            onDisconnect={onDisconnectPersonal}
            status={status}
          />
        }
      >
        <IntegrationSectionHeader
          connected={isPersonalConnected}
          description={description}
          details={details}
          iconSrc={iconSrc}
          title={title}
        />
      </IntegrationSectionLayout>
      <IntegrationPageDisconnectedAlert
        integrationName={integrationName}
        isPageConnected={isPageConnected}
      />
    </IntegrationSectionCard>
  );
}

export { IntegrationDetail };