import * as React from "react";

import {
  useDisconnectIntegration,
  useStartIntegrationOAuth,
  useUpdateLinearIntegrationSettings,
} from "@/features/integrations/hooks";
import type { LinearIntegrationStatus } from "@/features/integrations/queries";
import { getApiErrorMessage } from "@/lib/api";
import { integrationIcons } from "@/lib/integration-icons";
import { toast } from "sonner";

import { LinearIntegrationCard } from "../cards/linear";
import type { IntegrationSummary } from "../types";
import { integrationEndpointById, readDisconnectIntegrationId } from "./shared";
import type { IntegrationControllerContext } from "./types";

export function useLinearIntegrationController({
  canManageWorkspace,
  isLoadingIntegrations,
  setIntegrationsError,
  setSelectedIntegrationId,
  status,
}: IntegrationControllerContext & {
  status: LinearIntegrationStatus | null;
}) {
  const startOAuth = useStartIntegrationOAuth();
  const disconnectIntegration = useDisconnectIntegration();
  const updateSettings = useUpdateLinearIntegrationSettings();
  const isBusy =
    isLoadingIntegrations ||
    (startOAuth.isPending && startOAuth.variables?.id === "linear") ||
    (disconnectIntegration.isPending &&
      readDisconnectIntegrationId(disconnectIntegration.variables) ===
        "linear") ||
    updateSettings.isPending;

  const connectWorkspace = React.useCallback(
    async (enforceEmailMatch: boolean) => {
      setIntegrationsError(null);

      try {
        const response = await startOAuth.mutateAsync({
          id: integrationEndpointById.linear,
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
        id: integrationEndpointById.linear,
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
        id: "linear",
        mode: "workspace",
      });
      toast.success("Linear workspace disconnected.");
    } catch (error) {
      setIntegrationsError(getApiErrorMessage(error));
    }
  }, [disconnectIntegration, setIntegrationsError]);

  const disconnectPersonal = React.useCallback(async () => {
    setIntegrationsError(null);

    try {
      await disconnectIntegration.mutateAsync({
        id: "linear",
        mode: "personal",
      });
      toast.success("Linear account disconnected.");
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
            `Email matching enabled. Removed ${result.removedPersonalConnections} mismatched Linear connection${result.removedPersonalConnections === 1 ? "" : "s"}.`,
          );
        } else {
          toast.success(
            enforceEmailMatch
              ? "Linear email matching enabled."
              : "Linear email matching disabled.",
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
      "Linear connects issues, projects, teams, and cycles so Notelab can answer with current product and planning context.",
    category: "AI enterprise search",
    connected: status?.workspace.connected,
    connectDisabled:
      isBusy || status?.configured === false || status?.needsMigration === true,
    connectLabel: "Connect Linear",
    detail:
      status?.workspace.organizationName ||
      status?.personal.email ||
      "Read planning and delivery context from Linear.",
    id: "linear",
    icon: integrationIcons.linear,
    isBusy,
    name: "Linear",
    onConnect: () =>
      canManageWorkspace
        ? void connectWorkspace(status?.workspace.enforceEmailMatch ?? true)
        : void connectPersonal(),
    onManage: () => setSelectedIntegrationId("linear"),
  };

  const card = (
    <LinearIntegrationCard
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
