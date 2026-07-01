import * as React from "react";

import { useUpdateSlackIntegrationSettings } from "@notelab/features/integrations";
import type { SlackIntegrationStatus } from "@notelab/features/integrations";
import { integrationIcons } from "@/lib/integration-icons";

import { SlackIntegrationCard } from "../cards/slack";
import type { IntegrationSummary } from "../types";
import {
  toastEmailMatchToggle,
  useIntegrationBusyState,
  useIntegrationOAuthActions,
} from "./use-integration-oauth-actions";
import type { IntegrationControllerContext } from "./types";

export function useSlackIntegrationController({
  canManagePage,
  isLoadingIntegrations,
  setIntegrationsError,
  setSelectedIntegrationId,
  status,
}: IntegrationControllerContext & {
  status: SlackIntegrationStatus | null;
}) {
  const updateSettings = useUpdateSlackIntegrationSettings();
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
    integrationId: "slack",
    setIntegrationsError,
  });
  const isBusy = useIntegrationBusyState({
    disconnectIntegration,
    endpointId,
    isLoadingIntegrations,
    settingsPending: updateSettings.isPending,
    startOAuth,
  });

  const toggleEmailMatch = React.useCallback(
    async (enforceEmailMatch: boolean) => {
      await runWithIntegrationError(async () => {
        const result = await updateSettings.mutateAsync({ enforceEmailMatch });
        toastEmailMatchToggle({
          enabled: enforceEmailMatch,
          integrationName: "Slack",
          removedPersonalConnections: result.removedPersonalConnections,
        });
      });
    },
    [runWithIntegrationError, updateSettings],
  );

  const summary: IntegrationSummary = {
    about:
      "Slack gives Notelab access to the channels, files, canvases, and threads the installed app can see. Personal DMs stay outside this workspace connector.",
    category: "AI enterprise search",
    connected: status?.page.connected,
    connectDisabled:
      isBusy || status?.configured === false || status?.needsMigration === true,
    connectLabel: "Connect Slack",
    detail:
      status?.page.teamName ||
      status?.page.workspaceName ||
      status?.personal.email ||
      "Read page conversations and shared files.",
    id: "slack",
    icon: integrationIcons.slack,
    isBusy,
    name: "Slack",
    onConnect: () =>
      canManagePage
        ? void connectPage({
            enforceEmailMatch: status?.page.enforceEmailMatch ?? true,
          })
        : void connectPersonal(),
    onManage: () => setSelectedIntegrationId("slack"),
  };

  const card = (
    <SlackIntegrationCard
      canManagePage={canManagePage}
      isBusy={isBusy}
      onConnectPersonal={() => void connectPersonal()}
      onConnectPage={(enabled) =>
        void connectPage({ enforceEmailMatch: enabled })
      }
      onDisconnectPersonal={() =>
        void disconnectPersonal("Slack account disconnected.")
      }
      onDisconnectPage={() =>
        void disconnectPage("Slack page disconnected.")
      }
      onToggleEmailMatch={(enabled) => void toggleEmailMatch(enabled)}
      status={status}
    />
  );

  return { card, isBusy, summary };
}