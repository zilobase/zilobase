"use client";

import * as React from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { SettingsHeader } from "@/components/settings-header";
import {
  useActiveWorkspaceId,
  useIntegrations,
} from "@notelab/features/integrations";
import { useSession } from "@notelab/features/auth";
import { useWorkspaceAccessTargets } from "@notelab/features/workspaces";
import { getApiErrorMessage } from "@/lib/api";
import { toast } from "sonner";

import {
  IntegrationDetailShell,
  IntegrationGridCard,
  IntegrationSection,
  RefreshIntegrationsCard,
} from "./components";
import { useGithubIntegrationController } from "./controllers/use-github-integration";
import { useGmailIntegrationController } from "./controllers/use-gmail-integration";
import { useGoogleCalendarIntegrationController } from "./controllers/use-google-calendar-integration";
import { useGoogleDriveIntegrationController } from "./controllers/use-google-drive-integration";
import { useLinearIntegrationController } from "./controllers/use-linear-integration";
import { useSlackIntegrationController } from "./controllers/use-slack-integration";
import {
  clearOAuthCallbackParams,
  readOAuthCallbackResult,
} from "./oauth-messages";
import type { IntegrationId, IntegrationSummary } from "./types";

export default function WorkspaceIntegrationsSettingsPage() {
  const isActive = true;
  const activeWorkspaceId = useActiveWorkspaceId();
  const { data: sessionData } = useSession();
  const { data: accessTargets } = useWorkspaceAccessTargets(activeWorkspaceId);
  const integrationsQuery = useIntegrations();
  const gmailStatus = integrationsQuery.data?.gmail ?? null;
  const githubStatus = integrationsQuery.data?.github ?? null;
  const googleCalendarStatus = integrationsQuery.data?.googleCalendar ?? null;
  const googleDriveStatus = integrationsQuery.data?.googleDrive ?? null;
  const slackStatus = integrationsQuery.data?.slack ?? null;
  const linearStatus = integrationsQuery.data?.linear ?? null;
  const [integrationsError, setIntegrationsError] = React.useState<
    string | null
  >(null);
  const [oauthResult, setOauthResult] = React.useState<{
    message: string;
    status: "error" | "success";
  } | null>(null);
  const [selectedIntegrationId, setSelectedIntegrationId] =
    React.useState<IntegrationId | null>(null);
  const isLoadingIntegrations = integrationsQuery.isLoading;
  const currentMember = accessTargets?.members.find(
    (member) =>
      member.id === sessionData?.user?.id ||
      (sessionData?.user?.email &&
        member.email.toLowerCase() === sessionData.user.email.toLowerCase()),
  );
  const canManageLinearPage =
    currentMember?.role === "admin" || currentMember?.role === "owner";
  const canManageSlackPage = canManageLinearPage;
  const canManageGithubPage = canManageLinearPage;
  const canManageGoogleDrivePage = canManageLinearPage;
  const canManageGoogleCalendarPage = canManageLinearPage;
  const canManageGmailPage = canManageLinearPage;
  const controllerContext = {
    isLoadingIntegrations,
    setIntegrationsError,
    setSelectedIntegrationId,
  };
  const gmailIntegration = useGmailIntegrationController({
    ...controllerContext,
    canManagePage: canManageGmailPage,
    status: gmailStatus,
  });
  const githubIntegration = useGithubIntegrationController({
    ...controllerContext,
    canManagePage: canManageGithubPage,
    status: githubStatus,
  });
  const googleCalendarIntegration = useGoogleCalendarIntegrationController({
    ...controllerContext,
    canManagePage: canManageGoogleCalendarPage,
    status: googleCalendarStatus,
  });
  const googleDriveIntegration = useGoogleDriveIntegrationController({
    ...controllerContext,
    canManagePage: canManageGoogleDrivePage,
    status: googleDriveStatus,
  });
  const slackIntegration = useSlackIntegrationController({
    ...controllerContext,
    canManagePage: canManageSlackPage,
    status: slackStatus,
  });
  const linearIntegration = useLinearIntegrationController({
    ...controllerContext,
    canManagePage: canManageLinearPage,
    status: linearStatus,
  });

  React.useEffect(() => {
    if (integrationsQuery.error) {
      setIntegrationsError(getApiErrorMessage(integrationsQuery.error));
    }
  }, [integrationsQuery.error]);

  React.useEffect(() => {
    if (!isActive) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const result = readOAuthCallbackResult(params);

    if (!result) {
      return;
    }

    if (result.status === "success") {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
    clearOAuthCallbackParams(params);
    const nextSearch = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`,
    );

    const oauthResultTimeoutId = window.setTimeout(() => {
      setOauthResult({ message: result.message, status: result.status });
      if (result.status === "success") {
        void integrationsQuery.refetch();
      }
    }, 0);

    return () => window.clearTimeout(oauthResultTimeoutId);
  }, [integrationsQuery, isActive]);

  const integrationSummaries: IntegrationSummary[] = [
    gmailIntegration.summary,
    githubIntegration.summary,
    googleCalendarIntegration.summary,
    googleDriveIntegration.summary,
    slackIntegration.summary,
    linearIntegration.summary,
  ];
  const integrationCards: Partial<Record<IntegrationId, React.ReactNode>> = {
    gmail: gmailIntegration.card,
    github: githubIntegration.card,
    googleCalendar: googleCalendarIntegration.card,
    googleDrive: googleDriveIntegration.card,
    slack: slackIntegration.card,
    linear: linearIntegration.card,
  };
  const selectedIntegration = integrationSummaries.find(
    (integration) => integration.id === selectedIntegrationId,
  );
  const selectedIntegrationCard = selectedIntegrationId
    ? integrationCards[selectedIntegrationId]
    : null;

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        description="Connect workspace tools that Notelab can use for page context."
        title="Integrations"
      />
      <div className="mx-auto grid w-full max-w-4xl gap-4">
        {selectedIntegration ? (
          <IntegrationDetailShell
            integration={selectedIntegration}
            onBack={() => setSelectedIntegrationId(null)}
          >
            {selectedIntegrationCard}
          </IntegrationDetailShell>
        ) : (
          <RefreshIntegrationsCard
            isLoading={isLoadingIntegrations}
            onRefresh={() => void integrationsQuery.refetch()}
          />
        )}
        {integrationsError ? (
          <Alert variant="destructive">
            <AlertDescription>{integrationsError}</AlertDescription>
          </Alert>
        ) : null}
        {oauthResult ? (
          <Alert
            variant={oauthResult.status === "error" ? "destructive" : "default"}
          >
            <AlertDescription>{oauthResult.message}</AlertDescription>
          </Alert>
        ) : null}
        {gmailStatus?.needsMigration ||
        githubStatus?.needsMigration ||
        googleCalendarStatus?.needsMigration ||
        googleDriveStatus?.needsMigration ||
        slackStatus?.needsMigration ||
        linearStatus?.needsMigration ? (
          <Alert variant="destructive">
            <AlertDescription>
              The integrations database migration has not been applied yet.
            </AlertDescription>
          </Alert>
        ) : null}
        {selectedIntegration ? null : (
          <IntegrationSection
            description="Connect workspace tools for AI page research."
            title="AI enterprise search"
          >
            {integrationSummaries
              .filter(
                (integration) =>
                  integration.category === "AI enterprise search",
              )
              .map((integration, index, integrations) => (
                <IntegrationGridCard
                  integration={integration}
                  isFirst={index === 0}
                  isLast={index === integrations.length - 1}
                  key={integration.id}
                />
              ))}
          </IntegrationSection>
        )}
      </div>
    </main>
  );
}
