import * as React from "react";

import {
  useDisconnectIntegration,
  useStartIntegrationOAuth,
  useUpdateSlackIntegrationSettings,
} from "@/features/integrations/hooks";
import type { SlackIntegrationStatus } from "@/features/integrations/queries";
import { getApiErrorMessage } from "@/lib/api";
import { integrationIcons } from "@/lib/integration-icons";
import { toast } from "sonner";

import { SlackIntegrationCard } from "../cards/slack";
import type { IntegrationSummary } from "../types";
import { integrationEndpointById, readDisconnectIntegrationId } from "./shared";
import type { IntegrationControllerContext } from "./types";

export function useSlackIntegrationController({
  canManageWorkspace,
  isLoadingIntegrations,
  setIntegrationsError,
  setSelectedIntegrationId,
  status,
}: IntegrationControllerContext & {
  status: SlackIntegrationStatus | null;
}) {
  const startOAuth = useStartIntegrationOAuth();
  const disconnectIntegration = useDisconnectIntegration();
  const updateSettings = useUpdateSlackIntegrationSettings();
  const isBusy =
    isLoadingIntegrations ||
    (startOAuth.isPending && startOAuth.variables?.id === "slack") ||
    (disconnectIntegration.isPending &&
      readDisconnectIntegrationId(disconnectIntegration.variables) ===
        "slack") ||
    updateSettings.isPending;

  const connectWorkspace = React.useCallback(
    async (enforceEmailMatch: boolean) => {
      setIntegrationsError(null);

      try {
        const response = await startOAuth.mutateAsync({
          id: integrationEndpointById.slack,
          input: { enforceEmailMatch, mode: "workspace" },
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
        id: integrationEndpointById.slack,
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
        id: "slack",
        mode: "workspace",
      });
      toast.success("Slack workspace disconnected.");
    } catch (error) {
      setIntegrationsError(getApiErrorMessage(error));
    }
  }, [disconnectIntegration, setIntegrationsError]);

  const disconnectPersonal = React.useCallback(async () => {
    setIntegrationsError(null);

    try {
      await disconnectIntegration.mutateAsync({
        id: "slack",
        mode: "personal",
      });
      toast.success("Slack account disconnected.");
    } catch (error) {
      setIntegrationsError(getApiErrorMessage(error));
    }
  }, [disconnectIntegration, setIntegrationsError]);

  const toggleEmailMatch = React.useCallback(
    async (enforceEmailMatch: boolean) => {
      setIntegrationsError(null);

      try {
        const result = await updateSettings.mutateAsync({ enforceEmailMatch });

        if (enforceEmailMatch && result.removedPersonalConnections > 0) {
          toast.success(
            `Slack email matching enabled. Removed ${result.removedPersonalConnections} mismatched Slack connection${result.removedPersonalConnections === 1 ? "" : "s"}.`,
          );
        } else {
          toast.success(
            enforceEmailMatch
              ? "Slack email matching enabled."
              : "Slack email matching disabled.",
          );
        }
      } catch (error) {
        setIntegrationsError(getApiErrorMessage(error));
      }
    },
    [setIntegrationsError, updateSettings],
  );

  const summary: IntegrationSummary = {
    about:
      "Slack gives Notelab access to the channels, files, canvases, and threads the installed app can see. Personal DMs stay outside this organization connector.",
    category: "AI enterprise search",
    connected: status?.workspace.connected,
    connectDisabled:
      isBusy || status?.configured === false || status?.needsMigration === true,
    connectLabel: "Connect Slack",
    detail:
      status?.workspace.teamName ||
      status?.workspace.organizationName ||
      status?.personal.email ||
      "Read workspace conversations and shared files.",
    id: "slack",
    icon: integrationIcons.slack,
    isBusy,
    name: "Slack",
    onConnect: () =>
      canManageWorkspace
        ? void connectWorkspace(status?.workspace.enforceEmailMatch ?? true)
        : void connectPersonal(),
    onManage: () => setSelectedIntegrationId("slack"),
  };

  const card = (
    <SlackIntegrationCard
      canManageWorkspace={canManageWorkspace}
      isBusy={isBusy}
      onConnectPersonal={() => void connectPersonal()}
      onConnectWorkspace={(enabled) => void connectWorkspace(enabled)}
      onDisconnectPersonal={() => void disconnectPersonal()}
      onDisconnectWorkspace={() => void disconnectWorkspace()}
      onToggleEmailMatch={(enabled) => void toggleEmailMatch(enabled)}
      status={status}
    />
  );

  return { card, isBusy, summary };
}
