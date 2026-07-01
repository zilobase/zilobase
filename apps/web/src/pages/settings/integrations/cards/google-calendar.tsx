import * as React from "react";

import type { GoogleCalendarIntegrationStatus } from "@notelab/features/integrations";
import { integrationIcons } from "@/lib/integration-icons";

import {
  IntegrationDetail,
  IntegrationEmailMatchSetting,
  IntegrationOAuthNotConfiguredAlert,
  IntegrationPersonalAccountCard,
  IntegrationSectionCard,
  IntegrationSectionHeader,
  IntegrationSectionLayout,
  IntegrationSettingToggle,
  IntegrationPageActions,
  IntegrationPagePendingAlert,
  isIntegrationConnectBlocked,
} from "../integration-card-sections";
import { useIntegrationConnectionState } from "../use-integration-connection-state";

export function GoogleCalendarIntegrationCard({
  canManagePage,
  isBusy,
  onConnectPersonal,
  onConnectPage,
  onDisconnectPersonal,
  onDisconnectPage,
  onToggleCoworkerAccess,
  onToggleEmailMatch,
  status,
}: {
  canManagePage: boolean;
  isBusy: boolean;
  onConnectPersonal: () => void;
  onConnectPage: (input: {
    coworkerCalendarAccessEnabled: boolean;
    enforceEmailMatch: boolean;
  }) => void;
  onDisconnectPersonal: () => void;
  onDisconnectPage: () => void;
  onToggleCoworkerAccess: (enabled: boolean) => void;
  onToggleEmailMatch: (enabled: boolean) => void;
  status: GoogleCalendarIntegrationStatus | null;
}) {
  const {
    enforceEmailMatch,
    isPersonalConnected,
    isPageConnected,
    setPendingEmailMatch,
  } = useIntegrationConnectionState(status);
  const [pendingCoworkerAccess, setPendingCoworkerAccess] =
    React.useState(false);
  const coworkerAccessEnabled = isPageConnected
    ? status?.page.coworkerCalendarAccessEnabled === true
    : pendingCoworkerAccess;

  return (
    <div className="space-y-4">
      <IntegrationSectionCard>
        <IntegrationSectionLayout
          actions={
            <IntegrationPageActions
              canManagePage={canManagePage}
              connectDisabled={isIntegrationConnectBlocked(status)}
              connectLabel="Connect page"
              isBusy={isBusy}
              isPageConnected={isPageConnected}
              onConnectPage={() =>
                onConnectPage({
                  coworkerCalendarAccessEnabled: coworkerAccessEnabled,
                  enforceEmailMatch,
                })
              }
              onDisconnectPage={onDisconnectPage}
            />
          }
          footer={
            <>
              <IntegrationEmailMatchSetting
                canManagePage={canManagePage}
                checked={enforceEmailMatch}
                disabled={isBusy}
                integrationName="Google"
                isPageConnected={isPageConnected}
                onApply={onToggleEmailMatch}
                onPendingChange={setPendingEmailMatch}
              />
              <IntegrationSettingToggle
                checked={coworkerAccessEnabled}
                description="Allow AI to check free/busy blocks for other workspace calendars."
                disabled={isBusy || !canManagePage}
                onCheckedChange={(checked) => {
                  if (isPageConnected) {
                    onToggleCoworkerAccess(checked);
                  } else {
                    setPendingCoworkerAccess(checked);
                  }
                }}
                title="Coworker calendar availability"
              />
              <IntegrationPagePendingAlert
                canManagePage={canManagePage}
                isPageConnected={isPageConnected}
                memberMessage="Google Calendar page is not connected. Ask an admin to connect it before linking your calendar account."
              />
              <IntegrationOAuthNotConfiguredAlert
                message="Google OAuth is not configured on the backend."
                status={status}
              />
            </>
          }
        >
          <IntegrationSectionHeader
            connected={status?.page.connected}
            description="Admin-managed Google Page domain and calendar policy for personal calendar accounts."
            details={
              <>
                <IntegrationDetail
                  label="Domain"
                  value={status?.page.hostedDomain || "Not connected"}
                />
                <IntegrationDetail
                  label="Admin account"
                  value={status?.page.email || "Not connected"}
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
              </>
            }
            iconSrc={integrationIcons.googleCalendar}
            title="Google Calendar page"
          />
        </IntegrationSectionLayout>
      </IntegrationSectionCard>

      <IntegrationPersonalAccountCard
        description="Connect your Calendar identity so AI can read events visible to your Google account."
        details={
          <>
            <IntegrationDetail
              label="Account"
              value={status?.personal.email || "Not connected"}
            />
            <IntegrationDetail
              label="Domain"
              value={status?.personal.hostedDomain || "Not verified"}
            />
            <IntegrationDetail
              label="Page"
              value={
                status?.page.hostedDomain || "Page not connected"
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
          </>
        }
        iconSrc={integrationIcons.googleCalendar}
        integrationName="Google Calendar page"
        isBusy={isBusy}
        isPersonalConnected={isPersonalConnected}
        isPageConnected={isPageConnected}
        onConnectPersonal={onConnectPersonal}
        onDisconnectPersonal={onDisconnectPersonal}
        status={status}
        title="My Google Calendar account"
      />
    </div>
  );
}