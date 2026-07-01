import * as React from "react";
import type { Dispatch, SetStateAction } from "react";

import {
  useDisconnectIntegration,
  useStartIntegrationOAuth,
} from "@notelab/features/integrations";
import type { IntegrationEndpoint } from "@notelab/features/integrations";
import { getApiErrorMessage } from "@/lib/api";
import { toast } from "sonner";

import { integrationEndpointById, readDisconnectIntegrationId } from "./shared";
import type { IntegrationId } from "../types";

export function useIntegrationBusyState({
  disconnectIntegration,
  endpointId,
  isLoadingIntegrations,
  settingsPending = false,
  startOAuth,
}: {
  disconnectIntegration: ReturnType<typeof useDisconnectIntegration>;
  endpointId: IntegrationEndpoint;
  isLoadingIntegrations: boolean;
  settingsPending?: boolean;
  startOAuth: ReturnType<typeof useStartIntegrationOAuth>;
}) {
  return (
    isLoadingIntegrations ||
    (startOAuth.isPending && startOAuth.variables?.id === endpointId) ||
    (disconnectIntegration.isPending &&
      readDisconnectIntegrationId(disconnectIntegration.variables) ===
        endpointId) ||
    settingsPending
  );
}

export function useIntegrationOAuthActions({
  integrationId,
  setIntegrationsError,
}: {
  integrationId: IntegrationId;
  setIntegrationsError: Dispatch<SetStateAction<string | null>>;
}) {
  const startOAuth = useStartIntegrationOAuth();
  const disconnectIntegration = useDisconnectIntegration();
  const endpointId = integrationEndpointById[integrationId];

  const runWithIntegrationError = React.useCallback(
    async (action: () => Promise<void>) => {
      setIntegrationsError(null);

      try {
        await action();
      } catch (error) {
        setIntegrationsError(getApiErrorMessage(error));
      }
    },
    [setIntegrationsError],
  );

  const connectPersonal = React.useCallback(
    () =>
      runWithIntegrationError(async () => {
        const response = await startOAuth.mutateAsync({
          id: endpointId,
          input: { mode: "personal" },
        });
        window.location.assign(response.url);
      }),
    [endpointId, runWithIntegrationError, startOAuth],
  );

  const connectPage = React.useCallback(
    (input: Record<string, unknown>) =>
      runWithIntegrationError(async () => {
        const response = await startOAuth.mutateAsync({
          id: endpointId,
          input: { ...input, mode: "page" },
        });
        window.location.assign(response.url);
      }),
    [endpointId, runWithIntegrationError, startOAuth],
  );

  const disconnectPage = React.useCallback(
    (successMessage: string) =>
      runWithIntegrationError(async () => {
        await disconnectIntegration.mutateAsync({
          id: endpointId,
          mode: "page",
        });
        toast.success(successMessage);
      }),
    [disconnectIntegration, endpointId, runWithIntegrationError],
  );

  const disconnectPersonal = React.useCallback(
    (successMessage: string) =>
      runWithIntegrationError(async () => {
        await disconnectIntegration.mutateAsync({
          id: endpointId,
          mode: "personal",
        });
        toast.success(successMessage);
      }),
    [disconnectIntegration, endpointId, runWithIntegrationError],
  );

  return {
    connectPersonal,
    connectPage,
    disconnectIntegration,
    disconnectPersonal,
    disconnectPage,
    endpointId,
    runWithIntegrationError,
    startOAuth,
  };
}

export function toastEmailMatchToggle({
  enabled,
  integrationName,
  removedPersonalConnections,
}: {
  enabled: boolean;
  integrationName: string;
  removedPersonalConnections?: number;
}) {
  if (enabled && removedPersonalConnections && removedPersonalConnections > 0) {
    toast.success(
      `${integrationName} email matching enabled. Removed ${removedPersonalConnections} mismatched ${integrationName} connection${removedPersonalConnections === 1 ? "" : "s"}.`,
    );
    return;
  }

  toast.success(
    enabled
      ? `${integrationName} email matching enabled.`
      : `${integrationName} email matching disabled.`,
  );
}