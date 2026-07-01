import type { LinearIntegrationStatus } from "@notelab/features/integrations";
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

export function LinearIntegrationCard({
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
  status: LinearIntegrationStatus | null;
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
                integrationName="Linear"
                isPageConnected={isPageConnected}
                onApply={onToggleEmailMatch}
                onPendingChange={setPendingEmailMatch}
              />
              <IntegrationPagePendingAlert
                canManagePage={canManagePage}
                isPageConnected={isPageConnected}
                memberMessage="Linear page is not connected. Ask an admin to connect it before linking your Linear account."
              />
              <IntegrationOAuthNotConfiguredAlert
                message="Linear OAuth is not configured on the backend."
                status={status}
              />
            </>
          }
        >
          <IntegrationSectionHeader
            connected={status?.page.connected}
            description="Admin-managed Linear workspace connection. Members can connect their own Linear account after this page is connected."
            details={
              <>
                <IntegrationDetail
                  label="Page"
                  value={status?.page.workspaceName || "Not connected"}
                />
                <IntegrationDetail
                  label="Page ID"
                  value={status?.page.workspaceId || "Not connected"}
                />
                <IntegrationDetail
                  label="Email matching"
                  value={enforceEmailMatch ? "Required" : "Not required"}
                />
                <IntegrationDetail
                  label="OAuth"
                  value={status?.configured ? "Configured" : "Not configured"}
                />
              </>
            }
            iconSrc={integrationIcons.linear}
            title="Linear page"
          />
        </IntegrationSectionLayout>
      </IntegrationSectionCard>

      <IntegrationPersonalAccountCard
        description="Connect your own Linear identity so AI can read the Linear items your account can access."
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
                status?.page.workspaceName ||
                "Page not connected"
              }
            />
            <IntegrationDetail
              label="Access"
              value={isPersonalConnected ? "Read-only Linear" : "Not connected"}
            />
          </>
        }
        iconSrc={integrationIcons.linear}
        integrationName="Linear page"
        isBusy={isBusy}
        isPersonalConnected={isPersonalConnected}
        isPageConnected={isPageConnected}
        onConnectPersonal={onConnectPersonal}
        onDisconnectPersonal={onDisconnectPersonal}
        status={status}
        title="My Linear account"
      />
    </div>
  );
}