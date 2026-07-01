import { Input } from "@/components/ui/input";
import type { GithubIntegrationStatus } from "@notelab/features/integrations";
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

export function GithubIntegrationCard({
  canManagePage,
  githubWorkspaceLogin,
  isBusy,
  onConnectPersonal,
  onConnectPage,
  onDisconnectPersonal,
  onDisconnectPage,
  onWorkspaceLoginChange,
  onToggleEmailMatch,
  status,
}: {
  canManagePage: boolean;
  githubWorkspaceLogin: string;
  isBusy: boolean;
  onConnectPersonal: () => void;
  onConnectPage: (input: {
    enforceEmailMatch: boolean;
    workspaceLogin: string;
  }) => void;
  onDisconnectPersonal: () => void;
  onDisconnectPage: () => void;
  onWorkspaceLoginChange: (value: string) => void;
  onToggleEmailMatch: (enabled: boolean) => void;
  status: GithubIntegrationStatus | null;
}) {
  const {
    enforceEmailMatch,
    isPersonalConnected,
    isPageConnected,
    setPendingEmailMatch,
  } = useIntegrationConnectionState(status);
  const workspaceLogin =
    status?.page.workspaceLogin || githubWorkspaceLogin;
  const canConnectPage = workspaceLogin.trim().length > 0;

  return (
    <div className="space-y-4">
      <IntegrationSectionCard>
        <IntegrationSectionLayout
          actions={
            <IntegrationPageActions
              canManagePage={canManagePage}
              connectDisabled={
                isIntegrationConnectBlocked(status) || !canConnectPage
              }
              connectLabel="Connect workspace"
              isBusy={isBusy}
              isPageConnected={isPageConnected}
              onConnectPage={() =>
                onConnectPage({
                  enforceEmailMatch,
                  workspaceLogin,
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
                integrationName="GitHub"
                isPageConnected={isPageConnected}
                onApply={onToggleEmailMatch}
                onPendingChange={setPendingEmailMatch}
              />
              <IntegrationPagePendingAlert
                canManagePage={canManagePage}
                isPageConnected={isPageConnected}
                memberMessage="GitHub workspace is not connected. Ask an admin to connect it before linking your GitHub account."
              />
              <IntegrationOAuthNotConfiguredAlert
                message="GitHub OAuth is not configured on the backend."
                status={status}
              />
            </>
          }
        >
          <IntegrationSectionHeader
            connected={status?.page.connected}
            description="Admin-managed GitHub workspace connection for repository, issue, pull request, commit, and file context."
            details={
              <>
                <IntegrationDetail
                  label="Workspace"
                  value={
                    status?.page.workspaceLogin ||
                    status?.page.workspaceName ||
                    "Not connected"
                  }
                />
                <IntegrationDetail
                  label="Workspace ID"
                  value={status?.page.workspaceId || "Not connected"}
                />
                <IntegrationDetail
                  label="Email matching"
                  value={enforceEmailMatch ? "Required" : "Not required"}
                />
                <IntegrationDetail
                  label="Access"
                  value={
                    isPageConnected
                      ? "Workspace verified"
                      : "Not connected"
                  }
                />
              </>
            }
            extra={
              !isPageConnected && canManagePage ? (
                <div className="max-w-sm space-y-1.5">
                  <label
                    className="text-sm font-medium"
                    htmlFor="github-workspace-login"
                  >
                    Workspace login
                  </label>
                  <Input
                    disabled={isBusy}
                    id="github-workspace-login"
                    onChange={(event) =>
                      onWorkspaceLoginChange(event.target.value)
                    }
                    placeholder="acme-inc"
                    value={githubWorkspaceLogin}
                  />
                </div>
              ) : null
            }
            iconSrc={integrationIcons.github}
            title="GitHub workspace"
          />
        </IntegrationSectionLayout>
      </IntegrationSectionCard>

      <IntegrationPersonalAccountCard
        description="Connect your GitHub identity so Notelab can verify you belong to the connected GitHub workspace."
        details={
          <>
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
              label="Workspace"
              value={
                status?.page.workspaceLogin ||
                status?.page.workspaceName ||
                "Workspace not connected"
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
          </>
        }
        iconSrc={integrationIcons.github}
        integrationName="GitHub workspace"
        isBusy={isBusy}
        isPersonalConnected={isPersonalConnected}
        isPageConnected={isPageConnected}
        onConnectPersonal={onConnectPersonal}
        onDisconnectPersonal={onDisconnectPersonal}
        status={status}
        title="My GitHub account"
      />
    </div>
  );
}