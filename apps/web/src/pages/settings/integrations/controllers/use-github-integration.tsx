import * as React from "react";

import { useUpdateGithubIntegrationSettings } from "@notelab/features/integrations";
import type { GithubIntegrationStatus } from "@notelab/features/integrations";
import { integrationIcons } from "@/lib/integration-icons";
import { toast } from "sonner";

import { GithubIntegrationCard } from "../cards/github";
import type { IntegrationSummary } from "../types";
import {
  useIntegrationBusyState,
  useIntegrationOAuthActions,
} from "./use-integration-oauth-actions";
import type { IntegrationControllerContext } from "./types";

export function useGithubIntegrationController({
  canManagePage,
  isLoadingIntegrations,
  setIntegrationsError,
  setSelectedIntegrationId,
  status,
}: IntegrationControllerContext & {
  status: GithubIntegrationStatus | null;
}) {
  const updateSettings = useUpdateGithubIntegrationSettings();
  const [workspaceLogin, setWorkspaceLogin] = React.useState("");
  const {
    connectPersonal,
    connectPage,
    disconnectIntegration,
    disconnectPersonal,
    disconnectPage,
    endpointId,
    runWithIntegrationError,
    startOAuth,
  } = useIntegrationOAuthActions({
    integrationId: "github",
    setIntegrationsError,
  });
  const isBusy = useIntegrationBusyState({
    disconnectIntegration,
    endpointId,
    isLoadingIntegrations,
    settingsPending: updateSettings.isPending,
    startOAuth,
  });

  React.useEffect(() => {
    if (status?.page.workspaceLogin) {
      setWorkspaceLogin(status.page.workspaceLogin);
    }
  }, [status?.page.workspaceLogin]);

  const toggleEmailMatch = React.useCallback(
    async (enforceEmailMatch: boolean) => {
      await runWithIntegrationError(async () => {
        const response = await updateSettings.mutateAsync({
          enforceEmailMatch,
        });
        const removed = response.removedPersonalConnections;

        toast.success(
          enforceEmailMatch
            ? removed > 0
              ? `GitHub email matching enabled. Removed ${removed} invalid account connection${removed === 1 ? "" : "s"}.`
              : "GitHub email matching enabled."
            : "GitHub email matching disabled.",
        );
      });
    },
    [runWithIntegrationError, updateSettings],
  );

  const summary: IntegrationSummary = {
    about:
      "GitHub lets Notelab read visible repositories, issues, pull requests, commits, and files so AI answers can include engineering context.",
    category: "AI enterprise search",
    connected: status?.connected,
    connectDisabled:
      isBusy || status?.configured === false || status?.needsMigration === true,
    connectLabel: "Connect GitHub",
    detail:
      status?.page.workspaceLogin ||
      status?.page.workspaceName ||
      status?.personal.login ||
      "Read code and project activity for AI research.",
    id: "github",
    icon: integrationIcons.github,
    isBusy,
    name: "GitHub",
    onConnect: () => setSelectedIntegrationId("github"),
    onManage: () => setSelectedIntegrationId("github"),
  };

  const card = (
    <GithubIntegrationCard
      canManagePage={canManagePage}
      githubWorkspaceLogin={workspaceLogin}
      isBusy={isBusy}
      onConnectPersonal={() => void connectPersonal()}
      onConnectPage={(input) =>
        void connectPage({
          enforceEmailMatch: input.enforceEmailMatch,
          githubWorkspaceLogin: input.workspaceLogin,
        })
      }
      onDisconnectPersonal={() =>
        void disconnectPersonal("GitHub account disconnected.")
      }
      onDisconnectPage={() =>
        void disconnectPage("GitHub workspace disconnected.")
      }
      onWorkspaceLoginChange={setWorkspaceLogin}
      onToggleEmailMatch={(enabled) => void toggleEmailMatch(enabled)}
      status={status}
    />
  );

  return { card, isBusy, summary };
}