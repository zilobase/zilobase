import type { SlackIntegrationStatus } from "@notelab/features/integrations";
import { integrationIcons } from "@/lib/integration-icons";

import {
  IntegrationDetail,
  IntegrationEmailMatchSetting,
  IntegrationOAuthNotConfiguredAlert,
  IntegrationPersonalAccountCard,
  IntegrationSectionCard,
  IntegrationSectionHeader,
  IntegrationSectionLayout,
  IntegrationPageActions,
  IntegrationPagePendingAlert,
  isIntegrationConnectBlocked,
} from "../integration-card-sections";
import { useIntegrationConnectionState } from "../use-integration-connection-state";

export function SlackIntegrationCard({
  canManagePage,
  isBusy,
  onConnectPersonal,
  onConnectPage,
  onDisconnectPersonal,
  onDisconnectPage,
  onToggleEmailMatch,
  status,
}: {
  canManagePage: boolean;
  isBusy: boolean;
  onConnectPersonal: () => void;
  onConnectPage: (enforceEmailMatch: boolean) => void;
  onDisconnectPersonal: () => void;
  onDisconnectPage: () => void;
  onToggleEmailMatch: (enabled: boolean) => void;
  status: SlackIntegrationStatus | null;
}) {
  const {
    enforceEmailMatch,
    isPersonalConnected,
    isPageConnected,
    setPendingEmailMatch,
  } = useIntegrationConnectionState(status);

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
              onConnectPage={() => onConnectPage(enforceEmailMatch)}
              onDisconnectPage={onDisconnectPage}
            />
          }
          footer={
            <>
              <IntegrationEmailMatchSetting
                canManagePage={canManagePage}
                checked={enforceEmailMatch}
                disabled={isBusy}
                integrationName="Slack"
                isPageConnected={isPageConnected}
                onApply={onToggleEmailMatch}
                onPendingChange={setPendingEmailMatch}
              />
              <IntegrationPagePendingAlert
                canManagePage={canManagePage}
                isPageConnected={isPageConnected}
                memberMessage="Slack page is not connected. Ask an admin to connect it before linking your Slack account."
              />
              <IntegrationOAuthNotConfiguredAlert
                message="Slack OAuth is not configured on the backend."
                status={status}
              />
            </>
          }
        >
          <IntegrationSectionHeader
            connected={status?.page.connected}
            description="Admin-managed Slack app installation for workspace channels, files, canvases, and threads the app can access."
            details={
              <>
                <IntegrationDetail
                  label="Page"
                  value={
                    status?.page.teamName ||
                    status?.page.workspaceName ||
                    "Not connected"
                  }
                />
                <IntegrationDetail
                  label="Page ID"
                  value={
                    status?.page.teamId ||
                    status?.page.workspaceId ||
                    "Not connected"
                  }
                />
                <IntegrationDetail
                  label="Email matching"
                  value={enforceEmailMatch ? "Required" : "Not required"}
                />
                <IntegrationDetail
                  label="Install"
                  value={
                    status?.page.isEnterpriseInstall
                      ? "Enterprise install"
                      : "Page install"
                  }
                />
              </>
            }
            iconSrc={integrationIcons.slack}
            title="Slack page"
          />
        </IntegrationSectionLayout>
      </IntegrationSectionCard>

      <IntegrationPersonalAccountCard
        description="Connect your Slack identity so Notelab can verify you belong to the connected Slack page."
        details={
          <>
            <IntegrationDetail
              label="Account"
              value={
                status?.personal.name ||
                status?.personal.email ||
                "Not connected"
              }
            />
            <IntegrationDetail
              label="Email"
              value={status?.personal.email || "Not connected"}
            />
            <IntegrationDetail
              label="Page"
              value={
                status?.page.teamName ||
                status?.page.workspaceName ||
                "Page not connected"
              }
            />
            <IntegrationDetail
              label="Access"
              value={
                isPersonalConnected ? "Slack identity linked" : "Not connected"
              }
            />
          </>
        }
        iconSrc={integrationIcons.slack}
        integrationName="Slack page"
        isBusy={isBusy}
        isPersonalConnected={isPersonalConnected}
        isPageConnected={isPageConnected}
        onConnectPersonal={onConnectPersonal}
        onDisconnectPersonal={onDisconnectPersonal}
        status={status}
        title="My Slack account"
      />
    </div>
  );
}