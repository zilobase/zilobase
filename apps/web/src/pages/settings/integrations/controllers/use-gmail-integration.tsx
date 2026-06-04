import * as React from "react";

import {
  useDisconnectIntegration,
  useStartIntegrationOAuth,
  useUpdateGmailIntegrationSettings,
} from "@/features/integrations/hooks";
import type { GmailIntegrationStatus } from "@/features/integrations/queries";
import { getApiErrorMessage } from "@/lib/api";
import { integrationIcons } from "@/lib/integration-icons";
import { toast } from "sonner";

import { GmailIntegrationCard } from "../cards/gmail";
import type { IntegrationSummary } from "../types";
import { integrationEndpointById, readDisconnectIntegrationId } from "./shared";
import type { IntegrationControllerContext } from "./types";

export function useGmailIntegrationController({
  canManageWorkspace,
  isLoadingIntegrations,
  setIntegrationsError,
  setSelectedIntegrationId,
  status,
}: IntegrationControllerContext & {
  status: GmailIntegrationStatus | null;
}) {
  const startOAuth = useStartIntegrationOAuth();
  const disconnectIntegration = useDisconnectIntegration();
  const updateSettings = useUpdateGmailIntegrationSettings();
  const isBusy =
    isLoadingIntegrations ||
    (startOAuth.isPending && startOAuth.variables?.id === "gmail") ||
    (disconnectIntegration.isPending &&
      readDisconnectIntegrationId(disconnectIntegration.variables) ===
        "gmail") ||
    updateSettings.isPending;

  const connectPersonal = React.useCallback(async () => {
    setIntegrationsError(null);

    try {
      const response = await startOAuth.mutateAsync({
        id: integrationEndpointById.gmail,
        input: { mode: "personal" },
      });
      window.location.assign(response.url);
    } catch (error) {
      setIntegrationsError(getApiErrorMessage(error));
    }
  }, [setIntegrationsError, startOAuth]);

  const connectWorkspace = React.useCallback(
    async (enforceEmailMatch: boolean) => {
      setIntegrationsError(null);

      try {
        const response = await startOAuth.mutateAsync({
          id: integrationEndpointById.gmail,
          input: { enforceEmailMatch, mode: "workspace" },
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
        id: "gmail",
        mode: "workspace",
      });
      toast.success("Gmail workspace disconnected.");
    } catch (error) {
      setIntegrationsError(getApiErrorMessage(error));
    }
  }, [disconnectIntegration, setIntegrationsError]);

  const disconnectPersonal = React.useCallback(async () => {
    setIntegrationsError(null);

    try {
      await disconnectIntegration.mutateAsync({
        id: "gmail",
        mode: "personal",
      });
      toast.success("Gmail account disconnected.");
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
            `Gmail email matching enabled. Removed ${result.removedPersonalConnections} mismatched Gmail connection${result.removedPersonalConnections === 1 ? "" : "s"}.`,
          );
        } else {
          toast.success(
            enforceEmailMatch
              ? "Gmail email matching enabled."
              : "Gmail email matching disabled.",
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
      "Gmail gives Notelab read-only access to organization messages for AI search and workspace context. Workspace license verification helps keep access limited to approved business domains.",
    category: "AI enterprise search",
    connected: status?.workspace.connected,
    connectDisabled:
      isBusy || status?.configured === false || status?.needsMigration === true,
    connectLabel: "Connect Gmail",
    detail:
      status?.workspace.hostedDomain ||
      status?.personal.email ||
      "Read organization email through the AI interface.",
    id: "gmail",
    icon: integrationIcons.gmail,
    isBusy,
    name: "Gmail",
    onConnect: () =>
      canManageWorkspace
        ? void connectWorkspace(status?.workspace.enforceEmailMatch ?? true)
        : void connectPersonal(),
    onManage: () => setSelectedIntegrationId("gmail"),
    status,
  };

  const card = (
    <GmailIntegrationCard
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
