import * as React from "react";

import { useUpdateGmailIntegrationSettings } from "@notelab/features/integrations";
import type { GmailIntegrationStatus } from "@notelab/features/integrations";
import { integrationIcons } from "@/lib/integration-icons";

import { GmailIntegrationCard } from "../cards/gmail";
import type { IntegrationSummary } from "../types";
import {
  toastEmailMatchToggle,
  useIntegrationBusyState,
  useIntegrationOAuthActions,
} from "./use-integration-oauth-actions";
import type { IntegrationControllerContext } from "./types";

export function useGmailIntegrationController({
  canManagePage,
  isLoadingIntegrations,
  setIntegrationsError,
  setSelectedIntegrationId,
  status,
}: IntegrationControllerContext & {
  status: GmailIntegrationStatus | null;
}) {
  const updateSettings = useUpdateGmailIntegrationSettings();
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
    integrationId: "gmail",
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
          integrationName: "Gmail",
          removedPersonalConnections: result.removedPersonalConnections,
        });
      });
    },
    [runWithIntegrationError, updateSettings],
  );

  const summary: IntegrationSummary = {
    about:
      "Gmail lets Notelab read messages visible to the connected Google account so AI answers can include email context.",
    category: "AI enterprise search",
    connected: status?.page.connected,
    connectDisabled:
      isBusy || status?.configured === false || status?.needsMigration === true,
    connectLabel: "Connect Gmail",
    detail:
      status?.page.hostedDomain ||
      status?.personal.email ||
      "Read Gmail messages for AI page research.",
    id: "gmail",
    icon: integrationIcons.gmail,
    isBusy,
    name: "Gmail",
    onConnect: () =>
      canManagePage
        ? void connectPage({
            enforceEmailMatch: status?.page.enforceEmailMatch ?? true,
          })
        : void connectPersonal(),
    onManage: () => setSelectedIntegrationId("gmail"),
  };

  const card = (
    <GmailIntegrationCard
      canManagePage={canManagePage}
      isBusy={isBusy}
      onConnectPersonal={() => void connectPersonal()}
      onConnectPage={(enabled) =>
        void connectPage({ enforceEmailMatch: enabled })
      }
      onDisconnectPersonal={() =>
        void disconnectPersonal("Gmail account disconnected.")
      }
      onDisconnectPage={() =>
        void disconnectPage("Gmail page disconnected.")
      }
      onToggleEmailMatch={(enabled) => void toggleEmailMatch(enabled)}
      status={status}
    />
  );

  return { card, isBusy, summary };
}