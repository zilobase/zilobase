import * as React from "react";

import { useUpdateLinearIntegrationSettings } from "@notelab/features/integrations";
import type { LinearIntegrationStatus } from "@notelab/features/integrations";
import { integrationIcons } from "@/lib/integration-icons";

import { LinearIntegrationCard } from "../cards/linear";
import type { IntegrationSummary } from "../types";
import {
  toastEmailMatchToggle,
  useIntegrationBusyState,
  useIntegrationOAuthActions,
} from "./use-integration-oauth-actions";
import type { IntegrationControllerContext } from "./types";

export function useLinearIntegrationController({
  canManagePage,
  isLoadingIntegrations,
  setIntegrationsError,
  setSelectedIntegrationId,
  status,
}: IntegrationControllerContext & {
  status: LinearIntegrationStatus | null;
}) {
  const updateSettings = useUpdateLinearIntegrationSettings();
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
    integrationId: "linear",
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

        if (enforceEmailMatch && result.removedPersonalConnections > 0) {
          toastEmailMatchToggle({
            enabled: enforceEmailMatch,
            integrationName: "Linear",
            removedPersonalConnections: result.removedPersonalConnections,
          });
        } else {
          toastEmailMatchToggle({
            enabled: enforceEmailMatch,
            integrationName: "Linear",
          });
        }
      });
    },
    [runWithIntegrationError, updateSettings],
  );

  const summary: IntegrationSummary = {
    about:
      "Linear connects issues, projects, teams, and cycles so Notelab can answer with current product and planning context.",
    category: "AI enterprise search",
    connected: status?.page.connected,
    connectDisabled:
      isBusy || status?.configured === false || status?.needsMigration === true,
    connectLabel: "Connect Linear",
    detail:
      status?.page.workspaceName ||
      status?.personal.email ||
      "Read planning and delivery context from Linear.",
    id: "linear",
    icon: integrationIcons.linear,
    isBusy,
    name: "Linear",
    onConnect: () =>
      canManagePage
        ? void connectPage({
            enforceEmailMatch: status?.page.enforceEmailMatch ?? true,
          })
        : void connectPersonal(),
    onManage: () => setSelectedIntegrationId("linear"),
  };

  const card = (
    <LinearIntegrationCard
      canManagePage={canManagePage}
      isBusy={isBusy}
      onConnectPersonal={() => void connectPersonal()}
      onConnectPage={(enabled) =>
        void connectPage({ enforceEmailMatch: enabled })
      }
      onDisconnectPersonal={() =>
        void disconnectPersonal("Linear account disconnected.")
      }
      onDisconnectPage={() =>
        void disconnectPage("Linear page disconnected.")
      }
      onToggleEmailMatch={(enabled) => void toggleEmailMatch(enabled)}
      status={status}
    />
  );

  return { card, isBusy, summary };
}