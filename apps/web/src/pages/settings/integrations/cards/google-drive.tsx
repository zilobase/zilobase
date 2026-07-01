import type { GoogleDriveIntegrationStatus } from "@notelab/features/integrations";
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

export function GoogleDriveIntegrationCard({
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
  status: GoogleDriveIntegrationStatus | null;
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
                integrationName="Google"
                isPageConnected={isPageConnected}
                onApply={onToggleEmailMatch}
                onPendingChange={setPendingEmailMatch}
              />
              <IntegrationPagePendingAlert
                canManagePage={canManagePage}
                isPageConnected={isPageConnected}
                memberMessage="Google Drive page is not connected. Ask an admin to connect it before linking your Drive account."
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
            description="Admin-managed Google Page domain used to validate which Drive accounts may connect."
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
                  label="Access"
                  value={
                    isPageConnected
                      ? "Page domain verified"
                      : "Not connected"
                  }
                />
              </>
            }
            iconSrc={integrationIcons.googleDrive}
            title="Google Drive page"
          />
        </IntegrationSectionLayout>
      </IntegrationSectionCard>

      <IntegrationPersonalAccountCard
        description="Connect your Drive identity so AI can read files visible to your Google account."
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
                isPersonalConnected ? "Drive account linked" : "Not connected"
              }
            />
          </>
        }
        iconSrc={integrationIcons.googleDrive}
        integrationName="Google Drive page"
        isBusy={isBusy}
        isPersonalConnected={isPersonalConnected}
        isPageConnected={isPageConnected}
        onConnectPersonal={onConnectPersonal}
        onDisconnectPersonal={onDisconnectPersonal}
        status={status}
        title="My Google Drive account"
      />
    </div>
  );
}