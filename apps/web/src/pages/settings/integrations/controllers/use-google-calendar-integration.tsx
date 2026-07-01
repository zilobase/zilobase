import * as React from "react";

import { useUpdateGoogleCalendarIntegrationSettings } from "@notelab/features/integrations";
import type { GoogleCalendarIntegrationStatus } from "@notelab/features/integrations";
import { integrationIcons } from "@/lib/integration-icons";
import { toast } from "sonner";

import { GoogleCalendarIntegrationCard } from "../cards/google-calendar";
import type { IntegrationSummary } from "../types";
import {
  toastEmailMatchToggle,
  useIntegrationBusyState,
  useIntegrationOAuthActions,
} from "./use-integration-oauth-actions";
import type { IntegrationControllerContext } from "./types";

export function useGoogleCalendarIntegrationController({
  canManagePage,
  isLoadingIntegrations,
  setIntegrationsError,
  setSelectedIntegrationId,
  status,
}: IntegrationControllerContext & {
  status: GoogleCalendarIntegrationStatus | null;
}) {
  const updateSettings = useUpdateGoogleCalendarIntegrationSettings();
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
    integrationId: "googleCalendar",
    setIntegrationsError,
  });
  const isBusy = useIntegrationBusyState({
    disconnectIntegration,
    endpointId,
    isLoadingIntegrations,
    settingsPending: updateSettings.isPending,
    startOAuth,
  });

  const toggleCoworkerAccess = React.useCallback(
    async (enabled: boolean) => {
      if (enabled && status?.page.coworkerCalendarAccessGranted !== true) {
        await connectPage({
          coworkerCalendarAccessEnabled: true,
          enforceEmailMatch: status?.page.enforceEmailMatch ?? true,
        });
        return;
      }

      await runWithIntegrationError(async () => {
        await updateSettings.mutateAsync({
          coworkerCalendarAccessEnabled: enabled,
        });
        toast.success(
          enabled
            ? "Coworker calendar availability enabled."
            : "Coworker calendar availability disabled.",
        );
      });
    },
    [connectPage, runWithIntegrationError, status, updateSettings],
  );

  const toggleEmailMatch = React.useCallback(
    async (enforceEmailMatch: boolean) => {
      await runWithIntegrationError(async () => {
        const result = await updateSettings.mutateAsync({
          enforceEmailMatch,
        });
        toastEmailMatchToggle({
          enabled: enforceEmailMatch,
          integrationName: "Google Calendar",
          removedPersonalConnections: result.removedPersonalConnections,
        });
      });
    },
    [runWithIntegrationError, updateSettings],
  );

  const summary: IntegrationSummary = {
    about:
      "Google Calendar adds scheduling context from the connected user's calendars. Coworker free/busy lookup can be enabled separately when connected.",
    category: "AI enterprise search",
    connected: status?.page.connected,
    connectDisabled:
      isBusy || status?.configured === false || status?.needsMigration === true,
    connectLabel: "Connect Calendar",
    detail:
      status?.page.hostedDomain ||
      status?.personal.email ||
      "Read calendar events for scheduling-aware AI context.",
    id: "googleCalendar",
    icon: integrationIcons.googleCalendar,
    isBusy,
    name: "Google Calendar",
    onConnect: () =>
      canManagePage
        ? void connectPage({
            coworkerCalendarAccessEnabled:
              status?.page.coworkerCalendarAccessEnabled ?? false,
            enforceEmailMatch: status?.page.enforceEmailMatch ?? true,
          })
        : void connectPersonal(),
    onManage: () => setSelectedIntegrationId("googleCalendar"),
  };

  const card = (
    <GoogleCalendarIntegrationCard
      canManagePage={canManagePage}
      isBusy={isBusy}
      onConnectPersonal={() => void connectPersonal()}
      onConnectPage={(input) => void connectPage(input)}
      onDisconnectPersonal={() =>
        void disconnectPersonal("Google Calendar account disconnected.")
      }
      onDisconnectPage={() =>
        void disconnectPage("Google Calendar page disconnected.")
      }
      onToggleCoworkerAccess={(enabled) => void toggleCoworkerAccess(enabled)}
      onToggleEmailMatch={(enabled) => void toggleEmailMatch(enabled)}
      status={status}
    />
  );

  return { card, isBusy, summary };
}