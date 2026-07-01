import * as React from "react";

import { useUpdateGoogleDriveIntegrationSettings } from "@notelab/features/integrations";
import type { GoogleDriveIntegrationStatus } from "@notelab/features/integrations";
import { integrationIcons } from "@/lib/integration-icons";

import { GoogleDriveIntegrationCard } from "../cards/google-drive";
import type { IntegrationSummary } from "../types";
import {
  toastEmailMatchToggle,
  useIntegrationBusyState,
  useIntegrationOAuthActions,
} from "./use-integration-oauth-actions";
import type { IntegrationControllerContext } from "./types";

export function useGoogleDriveIntegrationController({
  canManagePage,
  isLoadingIntegrations,
  setIntegrationsError,
  setSelectedIntegrationId,
  status,
}: IntegrationControllerContext & {
  status: GoogleDriveIntegrationStatus | null;
}) {
  const updateSettings = useUpdateGoogleDriveIntegrationSettings();
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
    integrationId: "googleDrive",
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
          integrationName: "Google Drive",
          removedPersonalConnections: result.removedPersonalConnections,
        });
      });
    },
    [runWithIntegrationError, updateSettings],
  );

  const summary: IntegrationSummary = {
    about:
      "Google Drive lets Notelab read visible Drive files, Docs, Sheets, and Slides using read-only access for AI page research.",
    category: "AI enterprise search",
    connected: status?.page.connected,
    connectDisabled:
      isBusy || status?.configured === false || status?.needsMigration === true,
    connectLabel: "Connect Drive",
    detail:
      status?.page.hostedDomain ||
      status?.personal.email ||
      "Read files and docs for AI page research.",
    id: "googleDrive",
    icon: integrationIcons.googleDrive,
    isBusy,
    name: "Google Drive",
    onConnect: () =>
      canManagePage
        ? void connectPage({
            enforceEmailMatch: status?.page.enforceEmailMatch ?? true,
          })
        : void connectPersonal(),
    onManage: () => setSelectedIntegrationId("googleDrive"),
  };

  const card = (
    <GoogleDriveIntegrationCard
      canManagePage={canManagePage}
      isBusy={isBusy}
      onConnectPersonal={() => void connectPersonal()}
      onConnectPage={(enabled) =>
        void connectPage({ enforceEmailMatch: enabled })
      }
      onDisconnectPersonal={() =>
        void disconnectPersonal("Google Drive account disconnected.")
      }
      onDisconnectPage={() =>
        void disconnectPage("Google Drive page disconnected.")
      }
      onToggleEmailMatch={(enabled) => void toggleEmailMatch(enabled)}
      status={status}
    />
  );

  return { card, isBusy, summary };
}