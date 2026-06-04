import * as React from "react";

import {
  useDisconnectIntegration,
  useStartIntegrationOAuth,
  useUpdateGoogleCalendarIntegrationSettings,
} from "@/features/integrations/hooks";
import type { GoogleCalendarIntegrationStatus } from "@/features/integrations/queries";
import { getApiErrorMessage } from "@/lib/api";
import { integrationIcons } from "@/lib/integration-icons";
import { toast } from "sonner";

import { GoogleCalendarIntegrationCard } from "../cards/google-calendar";
import type { IntegrationSummary } from "../types";
import { integrationEndpointById, readDisconnectIntegrationId } from "./shared";
import type { IntegrationControllerContext } from "./types";

export function useGoogleCalendarIntegrationController({
  canManageWorkspace,
  isLoadingIntegrations,
  setIntegrationsError,
  setSelectedIntegrationId,
  status,
}: IntegrationControllerContext & {
  status: GoogleCalendarIntegrationStatus | null;
}) {
  const startOAuth = useStartIntegrationOAuth();
  const disconnectIntegration = useDisconnectIntegration();
  const updateSettings = useUpdateGoogleCalendarIntegrationSettings();
  const isBusy =
    isLoadingIntegrations ||
    (startOAuth.isPending &&
      startOAuth.variables?.id === "google-calendar") ||
    (disconnectIntegration.isPending &&
      readDisconnectIntegrationId(disconnectIntegration.variables) ===
        "google-calendar") ||
    updateSettings.isPending;

  const connectPersonal = React.useCallback(async () => {
    setIntegrationsError(null);

    try {
      const response = await startOAuth.mutateAsync({
        id: integrationEndpointById.googleCalendar,
        input: { mode: "personal" },
      });
      window.location.assign(response.url);
    } catch (error) {
      setIntegrationsError(getApiErrorMessage(error));
    }
  }, [setIntegrationsError, startOAuth]);

  const connectWorkspace = React.useCallback(
    async (input: {
      coworkerCalendarAccessEnabled: boolean;
      enforceEmailMatch: boolean;
    }) => {
      setIntegrationsError(null);

      try {
        const response = await startOAuth.mutateAsync({
          id: integrationEndpointById.googleCalendar,
          input: {
            coworkerCalendarAccessEnabled:
              input.coworkerCalendarAccessEnabled,
            enforceEmailMatch: input.enforceEmailMatch,
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

  const disconnectWorkspace = React.useCallback(async () => {
    setIntegrationsError(null);

    try {
      await disconnectIntegration.mutateAsync({
        id: "google-calendar",
        mode: "workspace",
      });
      toast.success("Google Calendar workspace disconnected.");
    } catch (error) {
      setIntegrationsError(getApiErrorMessage(error));
    }
  }, [disconnectIntegration, setIntegrationsError]);

  const disconnectPersonal = React.useCallback(async () => {
    setIntegrationsError(null);

    try {
      await disconnectIntegration.mutateAsync({
        id: "google-calendar",
        mode: "personal",
      });
      toast.success("Google Calendar account disconnected.");
    } catch (error) {
      setIntegrationsError(getApiErrorMessage(error));
    }
  }, [disconnectIntegration, setIntegrationsError]);

  const toggleCoworkerAccess = React.useCallback(
    async (enabled: boolean) => {
      if (enabled && status?.workspace.coworkerCalendarAccessGranted !== true) {
        await connectWorkspace({
          coworkerCalendarAccessEnabled: true,
          enforceEmailMatch: status?.workspace.enforceEmailMatch ?? true,
        });
        return;
      }

      setIntegrationsError(null);

      try {
        await updateSettings.mutateAsync({
          coworkerCalendarAccessEnabled: enabled,
        });
        toast.success(
          enabled
            ? "Coworker calendar availability enabled."
            : "Coworker calendar availability disabled.",
        );
      } catch (error) {
        setIntegrationsError(getApiErrorMessage(error));
      }
    },
    [connectWorkspace, setIntegrationsError, status, updateSettings],
  );

  const toggleEmailMatch = React.useCallback(
    async (enforceEmailMatch: boolean) => {
      setIntegrationsError(null);

      try {
        const result = await updateSettings.mutateAsync({
          enforceEmailMatch,
        });

        if (enforceEmailMatch && result.removedPersonalConnections > 0) {
          toast.success(
            `Google Calendar email matching enabled. Removed ${result.removedPersonalConnections} mismatched Google Calendar connection${result.removedPersonalConnections === 1 ? "" : "s"}.`,
          );
        } else {
          toast.success(
            enforceEmailMatch
              ? "Google Calendar email matching enabled."
              : "Google Calendar email matching disabled.",
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
      "Google Calendar adds scheduling context from the connected user's calendars. Coworker free/busy lookup can be enabled separately when connected.",
    category: "AI enterprise search",
    connected: status?.workspace.connected,
    connectDisabled:
      isBusy || status?.configured === false || status?.needsMigration === true,
    connectLabel: "Connect Calendar",
    detail:
      status?.workspace.hostedDomain ||
      status?.personal.email ||
      "Read calendar events for scheduling-aware AI context.",
    id: "googleCalendar",
    icon: integrationIcons.googleCalendar,
    isBusy,
    name: "Google Calendar",
    onConnect: () =>
      canManageWorkspace
        ? void connectWorkspace({
            coworkerCalendarAccessEnabled:
              status?.workspace.coworkerCalendarAccessEnabled ?? false,
            enforceEmailMatch: status?.workspace.enforceEmailMatch ?? true,
          })
        : void connectPersonal(),
    onManage: () => setSelectedIntegrationId("googleCalendar"),
  };

  const card = (
    <GoogleCalendarIntegrationCard
      canManageWorkspace={canManageWorkspace}
      isBusy={isBusy}
      onConnectPersonal={() => void connectPersonal()}
      onConnectWorkspace={(input) => void connectWorkspace(input)}
      onDisconnectPersonal={() => void disconnectPersonal()}
      onDisconnectWorkspace={() => void disconnectWorkspace()}
      onToggleCoworkerAccess={(enabled) => void toggleCoworkerAccess(enabled)}
      onToggleEmailMatch={(enabled) => void toggleEmailMatch(enabled)}
      status={status}
    />
  );

  return { card, isBusy, summary };
}
