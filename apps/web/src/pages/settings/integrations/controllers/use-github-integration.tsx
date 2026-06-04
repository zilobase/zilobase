import * as React from "react";

import {
  useDisconnectIntegration,
  useStartIntegrationOAuth,
  useUpdateGithubIntegrationSettings,
} from "@/features/integrations/hooks";
import type { GithubIntegrationStatus } from "@/features/integrations/queries";
import { getApiErrorMessage } from "@/lib/api";
import { integrationIcons } from "@/lib/integration-icons";
import { toast } from "sonner";

import { GithubIntegrationCard } from "../cards/github";
import type { IntegrationSummary } from "../types";
import { integrationEndpointById, readDisconnectIntegrationId } from "./shared";
import type { IntegrationControllerContext } from "./types";

export function useGithubIntegrationController({
  canManageWorkspace,
  isLoadingIntegrations,
  setIntegrationsError,
  setSelectedIntegrationId,
  status,
}: IntegrationControllerContext & {
  status: GithubIntegrationStatus | null;
}) {
  const startOAuth = useStartIntegrationOAuth();
  const disconnectIntegration = useDisconnectIntegration();
  const updateSettings = useUpdateGithubIntegrationSettings();
  const [organizationLogin, setOrganizationLogin] = React.useState("");

  React.useEffect(() => {
    if (status?.workspace.organizationLogin) {
      setOrganizationLogin(status.workspace.organizationLogin);
    }
  }, [status?.workspace.organizationLogin]);

  const isBusy =
    isLoadingIntegrations ||
    (startOAuth.isPending && startOAuth.variables?.id === "github") ||
    (disconnectIntegration.isPending &&
      readDisconnectIntegrationId(disconnectIntegration.variables) ===
        "github") ||
    updateSettings.isPending;

  const connectWorkspace = React.useCallback(
    async (input: { enforceEmailMatch: boolean; organizationLogin: string }) => {
      setIntegrationsError(null);

      try {
        const response = await startOAuth.mutateAsync({
          id: integrationEndpointById.github,
          input: {
            enforceEmailMatch: input.enforceEmailMatch,
            githubOrganizationLogin: input.organizationLogin,
            mode: "workspace",
          },
        });
        window.location.assign(response.url);
      } catch (error) {
        setIntegrationsError(getApiErrorMessage(error));
      }
    },
    [setIntegrationsError, startOAuth],
  );

  const connectPersonal = React.useCallback(async () => {
    setIntegrationsError(null);

    try {
      const response = await startOAuth.mutateAsync({
        id: integrationEndpointById.github,
        input: { mode: "personal" },
      });
      window.location.assign(response.url);
    } catch (error) {
      setIntegrationsError(getApiErrorMessage(error));
    }
  }, [setIntegrationsError, startOAuth]);

  const disconnectWorkspace = React.useCallback(async () => {
    setIntegrationsError(null);

    try {
      await disconnectIntegration.mutateAsync({
        id: "github",
        mode: "workspace",
      });
      toast.success("GitHub organization disconnected.");
    } catch (error) {
      setIntegrationsError(getApiErrorMessage(error));
    }
  }, [disconnectIntegration, setIntegrationsError]);

  const disconnectPersonal = React.useCallback(async () => {
    setIntegrationsError(null);

    try {
      await disconnectIntegration.mutateAsync({
        id: "github",
        mode: "personal",
      });
      toast.success("GitHub account disconnected.");
    } catch (error) {
      setIntegrationsError(getApiErrorMessage(error));
    }
  }, [disconnectIntegration, setIntegrationsError]);

  const toggleEmailMatch = React.useCallback(
    async (enforceEmailMatch: boolean) => {
      setIntegrationsError(null);

      try {
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
      } catch (error) {
        setIntegrationsError(getApiErrorMessage(error));
      }
    },
    [setIntegrationsError, updateSettings],
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
      status?.workspace.organizationLogin ||
      status?.workspace.organizationName ||
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
      canManageWorkspace={canManageWorkspace}
      githubOrganizationLogin={organizationLogin}
      isBusy={isBusy}
      onConnectPersonal={() => void connectPersonal()}
      onConnectWorkspace={(input) => void connectWorkspace(input)}
      onDisconnectPersonal={() => void disconnectPersonal()}
      onDisconnectWorkspace={() => void disconnectWorkspace()}
      onOrganizationLoginChange={setOrganizationLogin}
      onToggleEmailMatch={(enabled) => void toggleEmailMatch(enabled)}
      status={status}
    />
  );

  return { card, isBusy, summary };
}
