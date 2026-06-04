import * as React from "react";

import {
  useDisconnectIntegration,
  useStartIntegrationOAuth,
  useUpdateGoogleDriveIntegrationSettings,
} from "@/features/integrations/hooks";
import type { GoogleDriveIntegrationStatus } from "@/features/integrations/queries";
import { getApiErrorMessage } from "@/lib/api";
import { integrationIcons } from "@/lib/integration-icons";
import { toast } from "sonner";

import { GoogleDriveIntegrationCard } from "../cards/google-drive";
import type { IntegrationSummary } from "../types";
import { integrationEndpointById, readDisconnectIntegrationId } from "./shared";
import type { IntegrationControllerContext } from "./types";

export function useGoogleDriveIntegrationController({
  canManageWorkspace,
  isLoadingIntegrations,
  setIntegrationsError,
  setSelectedIntegrationId,
  status,
}: IntegrationControllerContext & {
  status: GoogleDriveIntegrationStatus | null;
}) {
  const startOAuth = useStartIntegrationOAuth();
  const disconnectIntegration = useDisconnectIntegration();
  const updateSettings = useUpdateGoogleDriveIntegrationSettings();
  const isBusy =
    isLoadingIntegrations ||
    (startOAuth.isPending && startOAuth.variables?.id === "google-drive") ||
    (disconnectIntegration.isPending &&
      readDisconnectIntegrationId(disconnectIntegration.variables) ===
        "google-drive") ||
    updateSettings.isPending;

  const connectPersonal = React.useCallback(async () => {
    setIntegrationsError(null);

    try {
      const response = await startOAuth.mutateAsync({
        id: integrationEndpointById.googleDrive,
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
          id: integrationEndpointById.googleDrive,
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
        id: "google-drive",
        mode: "workspace",
      });
      toast.success("Google Drive workspace disconnected.");
    } catch (error) {
      setIntegrationsError(getApiErrorMessage(error));
    }
  }, [disconnectIntegration, setIntegrationsError]);

  const disconnectPersonal = React.useCallback(async () => {
    setIntegrationsError(null);

    try {
      await disconnectIntegration.mutateAsync({
        id: "google-drive",
        mode: "personal",
      });
      toast.success("Google Drive account disconnected.");
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
            `Google Drive email matching enabled. Removed ${result.removedPersonalConnections} mismatched Google Drive connection${result.removedPersonalConnections === 1 ? "" : "s"}.`,
          );
        } else {
          toast.success(
            enforceEmailMatch
              ? "Google Drive email matching enabled."
              : "Google Drive email matching disabled.",
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
      "Google Drive lets Notelab read visible Drive files, Docs, Sheets, and Slides using read-only access for AI workspace research.",
    category: "AI enterprise search",
    connected: status?.workspace.connected,
    connectDisabled:
      isBusy || status?.configured === false || status?.needsMigration === true,
    connectLabel: "Connect Drive",
    detail:
      status?.workspace.hostedDomain ||
      status?.personal.email ||
      "Read files and docs for AI workspace research.",
    id: "googleDrive",
    icon: integrationIcons.googleDrive,
    isBusy,
    name: "Google Drive",
    onConnect: () =>
      canManageWorkspace
        ? void connectWorkspace(status?.workspace.enforceEmailMatch ?? true)
        : void connectPersonal(),
    onManage: () => setSelectedIntegrationId("googleDrive"),
  };

  const card = (
    <GoogleDriveIntegrationCard
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
