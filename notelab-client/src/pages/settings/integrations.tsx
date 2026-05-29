"use client";

import * as React from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "@/components/settings-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import {
  useDisconnectIntegration,
  useIntegrations,
  useStartIntegrationOAuth,
  useUpdateGoogleCalendarIntegrationSettings,
  type IntegrationEndpoint,
} from "@/features/integrations/hooks";
import {
  type GmailIntegrationStatus,
  type GithubIntegrationStatus,
  type GoogleCalendarIntegrationStatus,
  type GoogleDriveIntegrationStatus,
  type LinearIntegrationStatus,
  type SlackIntegrationStatus,
} from "@/features/integrations/queries";
import { integrationIcons } from "@/lib/integration-icons";
import { getApiErrorMessage } from "@/lib/api";
import {
  CheckCircle2Icon,
  ArrowLeftIcon,
  Loader2Icon,
  PlugIcon,
  RotateCwIcon,
  UnplugIcon,
} from "lucide-react";
import { toast } from "sonner";

type IntegrationId =
  | "gmail"
  | "github"
  | "googleCalendar"
  | "googleDrive"
  | "slack"
  | "linear";

type IntegrationSummary = {
  about: string;
  category: "AI enterprise search";
  connected: boolean | undefined;
  connectDisabled: boolean;
  connectLabel: string;
  detail: string;
  id: IntegrationId;
  icon: string;
  isBusy: boolean;
  name: string;
  onConnect: () => void;
  onManage: () => void;
  status?: IntegrationStatus | null;
};

type IntegrationStatus =
  | GmailIntegrationStatus
  | GithubIntegrationStatus
  | GoogleCalendarIntegrationStatus
  | GoogleDriveIntegrationStatus
  | LinearIntegrationStatus
  | SlackIntegrationStatus;

const integrationEndpointById: Record<IntegrationId, IntegrationEndpoint> = {
  gmail: "gmail",
  github: "github",
  googleCalendar: "google-calendar",
  googleDrive: "google-drive",
  linear: "linear",
  slack: "slack",
};

const gmailOAuthMessages: Record<string, string> = {
  admin_required:
    "A Google Workspace admin must connect Gmail to verify paid licenses.",
  connected: "Gmail connected.",
  consumer_google_account:
    "Use a paid Google Workspace account, not Gmail.com.",
  email_not_allowed:
    "The connected Google email must be a member or pending invite in this organization.",
  email_not_in_organization:
    "The connected Google email must be a member or pending invite in this organization.",
  invalid_id_token: "Google could not verify the connected account.",
  invalid_oauth_state: "The Gmail connection expired. Try connecting again.",
  google_oauth_not_configured: "Google OAuth is not configured.",
  missing_hosted_domain:
    "Use a Google Workspace account with a hosted organization domain.",
  unauthorized: "Sign in again before connecting Gmail.",
};

const githubOAuthMessages: Record<string, string> = {
  connected: "GitHub connected.",
  github_not_configured: "GitHub OAuth is not configured.",
  invalid_oauth_state: "The GitHub connection expired. Try connecting again.",
  missing_access_token: "GitHub did not return an access token.",
  oauth_callback_failed: "GitHub connection failed during OAuth.",
  unauthorized: "Sign in again before connecting GitHub.",
};

const googleCalendarOAuthMessages: Record<string, string> = {
  connected: "Google Calendar connected.",
  google_oauth_not_configured: "Google OAuth is not configured.",
  invalid_id_token: "Google could not verify the connected account.",
  invalid_oauth_state:
    "The Google Calendar connection expired. Try connecting again.",
  missing_id_token: "Google did not return an identity token.",
  oauth_callback_failed: "Google Calendar connection failed during OAuth.",
  unauthorized: "Sign in again before connecting Google Calendar.",
  unverified_email: "Google could not verify the connected email.",
};

const googleDriveOAuthMessages: Record<string, string> = {
  connected: "Google Drive connected.",
  google_oauth_not_configured: "Google OAuth is not configured.",
  invalid_id_token: "Google could not verify the connected account.",
  invalid_oauth_state:
    "The Google Drive connection expired. Try connecting again.",
  missing_id_token: "Google did not return an identity token.",
  oauth_callback_failed: "Google Drive connection failed during OAuth.",
  unauthorized: "Sign in again before connecting Google Drive.",
  unverified_email: "Google could not verify the connected email.",
};

const slackOAuthMessages: Record<string, string> = {
  connected: "Slack connected.",
  invalid_oauth_state: "The Slack connection expired. Try connecting again.",
  missing_access_token: "Slack did not return an app access token.",
  oauth_callback_failed: "Slack connection failed during OAuth.",
  slack_not_configured: "Slack OAuth is not configured.",
  unauthorized: "Sign in again before connecting Slack.",
};

const linearOAuthMessages: Record<string, string> = {
  connected: "Linear connected.",
  invalid_oauth_state: "The Linear connection expired. Try connecting again.",
  linear_not_configured: "Linear OAuth is not configured.",
  missing_access_token: "Linear did not return an access token.",
  oauth_callback_failed: "Linear connection failed during OAuth.",
  unauthorized: "Sign in again before connecting Linear.",
};

export default function OrganizationIntegrationsSettingsPage() {
  const isActive = true;
  const integrationsQuery = useIntegrations();
  const startOAuth = useStartIntegrationOAuth();
  const disconnectIntegration = useDisconnectIntegration();
  const updateGoogleCalendarSettings =
    useUpdateGoogleCalendarIntegrationSettings();
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
  const isSavingGmail =
    (startOAuth.isPending && startOAuth.variables?.id === "gmail") ||
    (disconnectIntegration.isPending && disconnectIntegration.variables === "gmail");
  const isSavingGithub =
    (startOAuth.isPending && startOAuth.variables?.id === "github") ||
    (disconnectIntegration.isPending && disconnectIntegration.variables === "github");
  const isSavingGoogleCalendar =
    (startOAuth.isPending && startOAuth.variables?.id === "google-calendar") ||
    (disconnectIntegration.isPending &&
      disconnectIntegration.variables === "google-calendar") ||
    updateGoogleCalendarSettings.isPending;
  const isSavingGoogleDrive =
    (startOAuth.isPending && startOAuth.variables?.id === "google-drive") ||
    (disconnectIntegration.isPending &&
      disconnectIntegration.variables === "google-drive");
  const isSavingSlack =
    (startOAuth.isPending && startOAuth.variables?.id === "slack") ||
    (disconnectIntegration.isPending && disconnectIntegration.variables === "slack");
  const isSavingLinear =
    (startOAuth.isPending && startOAuth.variables?.id === "linear") ||
    (disconnectIntegration.isPending && disconnectIntegration.variables === "linear");

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
    const gmail = params.get("gmail");
    const github = params.get("github");
    const googleCalendar = params.get("googleCalendar");
    const googleDrive = params.get("googleDrive");
    const slack = params.get("slack");
    const linear = params.get("linear");
    const code = params.get("code");
    const status =
      gmail || github || googleCalendar || googleDrive || slack || linear;
    const integration = gmail
      ? "gmail"
      : github
        ? "github"
        : googleCalendar
          ? "googleCalendar"
          : googleDrive
            ? "googleDrive"
              : slack
                ? "slack"
                : linear
                  ? "linear"
                  : null;

    if (!status || !integration) {
      return;
    }

    const messages =
      integration === "gmail"
        ? gmailOAuthMessages
        : integration === "github"
          ? githubOAuthMessages
          : integration === "googleCalendar"
            ? googleCalendarOAuthMessages
            : integration === "googleDrive"
              ? googleDriveOAuthMessages
              : integration === "slack"
                ? slackOAuthMessages
                : integration === "linear"
                  ? linearOAuthMessages
                  : {};
    const defaultSuccess =
      integration === "gmail"
        ? "Gmail connected."
        : integration === "github"
          ? "GitHub connected."
          : integration === "googleCalendar"
            ? "Google Calendar connected."
            : integration === "googleDrive"
              ? "Google Drive connected."
              : integration === "slack"
                ? "Slack connected."
                : integration === "linear"
                  ? "Linear connected."
                  : "Integration connected.";
    const defaultError =
      integration === "gmail"
        ? "Gmail connection failed."
        : integration === "github"
          ? "GitHub connection failed."
          : integration === "googleCalendar"
            ? "Google Calendar connection failed."
            : integration === "googleDrive"
              ? "Google Drive connection failed."
              : integration === "slack"
                ? "Slack connection failed."
                : integration === "linear"
                  ? "Linear connection failed."
                  : "Integration connection failed.";
    const message =
      messages[code || ""] ||
      (status === "success" ? defaultSuccess : defaultError);
    const oauthResultStatus = status === "success" ? "success" : "error";

    if (status === "success") {
      toast.success(message);
    } else {
      toast.error(message);
    }

    params.delete("gmail");
    params.delete("github");
    params.delete("googleCalendar");
    params.delete("googleDrive");
    params.delete("slack");
    params.delete("linear");
    params.delete("code");
    if (params.get("settings") === "integrations") {
      params.delete("settings");
    }
    const nextSearch = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`,
    );

    const oauthResultTimeoutId = window.setTimeout(() => {
      setOauthResult({ message, status: oauthResultStatus });
      if (oauthResultStatus === "success") {
        void integrationsQuery.refetch();
      }
    }, 0);

    return () => window.clearTimeout(oauthResultTimeoutId);
  }, [integrationsQuery, isActive]);

  const handleConnectIntegration = async (
    integrationId: IntegrationId,
    input?: unknown,
  ) => {
    setIntegrationsError(null);

    try {
      const response = await startOAuth.mutateAsync({
        id: integrationEndpointById[integrationId],
        input,
      });
      window.location.assign(response.url);
    } catch (error) {
      setIntegrationsError(getApiErrorMessage(error));
    }
  };

  const handleDisconnectIntegration = async (
    integrationId: IntegrationId,
    name: string,
  ) => {
    setIntegrationsError(null);

    try {
      await disconnectIntegration.mutateAsync(integrationEndpointById[integrationId]);
      toast.success(`${name} disconnected.`);
    } catch (error) {
      setIntegrationsError(getApiErrorMessage(error));
    }
  };

  const handleConnectGmail = () => void handleConnectIntegration("gmail");
  const handleDisconnectGmail = () =>
    void handleDisconnectIntegration("gmail", "Gmail");
  const handleConnectGithub = () => void handleConnectIntegration("github");
  const handleDisconnectGithub = () =>
    void handleDisconnectIntegration("github", "GitHub");

  const handleConnectGoogleCalendar = async (
    coworkerCalendarAccessEnabled = false,
  ) => {
    await handleConnectIntegration("googleCalendar", {
      coworkerCalendarAccessEnabled,
    });
  };

  const handleDisconnectGoogleCalendar = () =>
    void handleDisconnectIntegration("googleCalendar", "Google Calendar");

  const handleToggleGoogleCalendarCoworkerAccess = async (enabled: boolean) => {
    if (
      enabled &&
      googleCalendarStatus?.coworkerCalendarAccessGranted !== true
    ) {
      await handleConnectGoogleCalendar(true);
      return;
    }

    setIntegrationsError(null);

    try {
      await updateGoogleCalendarSettings.mutateAsync({
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
  };

  const handleConnectGoogleDrive = () =>
    void handleConnectIntegration("googleDrive");
  const handleDisconnectGoogleDrive = () =>
    void handleDisconnectIntegration("googleDrive", "Google Drive");
  const handleConnectSlack = () => void handleConnectIntegration("slack");
  const handleDisconnectSlack = () =>
    void handleDisconnectIntegration("slack", "Slack");
  const handleConnectLinear = () => void handleConnectIntegration("linear");
  const handleDisconnectLinear = () =>
    void handleDisconnectIntegration("linear", "Linear");

  const integrationSummaries: IntegrationSummary[] = [
    {
      about:
        "Gmail gives Notelab read-only access to organization messages for AI search and workspace context. Workspace license verification helps keep access limited to approved business domains.",
      category: "AI enterprise search",
      connected: gmailStatus?.connected,
      connectDisabled:
        isLoadingIntegrations ||
        isSavingGmail ||
        gmailStatus?.configured === false ||
        gmailStatus?.needsMigration === true,
      connectLabel: "Connect Gmail",
      detail:
        gmailStatus?.email ||
        gmailStatus?.hostedDomain ||
        "Read organization email through the AI interface.",
      id: "gmail",
      icon: integrationIcons.gmail,
      isBusy: isLoadingIntegrations || isSavingGmail,
      name: "Gmail",
      onConnect: handleConnectGmail,
      onManage: () => setSelectedIntegrationId("gmail"),
      status: gmailStatus,
    },
    {
      about:
        "GitHub lets Notelab read visible repositories, issues, pull requests, commits, and files so AI answers can include engineering context.",
      category: "AI enterprise search",
      connected: githubStatus?.connected,
      connectDisabled:
        isLoadingIntegrations ||
        isSavingGithub ||
        githubStatus?.configured === false ||
        githubStatus?.needsMigration === true,
      connectLabel: "Connect GitHub",
      detail:
        githubStatus?.connectedUserLogin ||
        githubStatus?.connectedUserName ||
        githubStatus?.displayName ||
        "Read code and project activity for AI research.",
      id: "github",
      icon: integrationIcons.github,
      isBusy: isLoadingIntegrations || isSavingGithub,
      name: "GitHub",
      onConnect: handleConnectGithub,
      onManage: () => setSelectedIntegrationId("github"),
    },
    {
      about:
        "Google Calendar adds scheduling context from the connected user's calendars. Coworker free/busy lookup can be enabled separately when connected.",
      category: "AI enterprise search",
      connected: googleCalendarStatus?.connected,
      connectDisabled:
        isLoadingIntegrations ||
        isSavingGoogleCalendar ||
        googleCalendarStatus?.configured === false ||
        googleCalendarStatus?.needsMigration === true,
      connectLabel: "Connect Calendar",
      detail:
        googleCalendarStatus?.email ||
        googleCalendarStatus?.hostedDomain ||
        "Read calendar events for scheduling-aware AI context.",
      id: "googleCalendar",
      icon: integrationIcons.googleCalendar,
      isBusy: isLoadingIntegrations || isSavingGoogleCalendar,
      name: "Google Calendar",
      onConnect: () => void handleConnectGoogleCalendar(false),
      onManage: () => setSelectedIntegrationId("googleCalendar"),
    },
    {
      about:
        "Google Drive lets Notelab read visible Drive files, Docs, Sheets, and Slides using read-only access for AI workspace research.",
      category: "AI enterprise search",
      connected: googleDriveStatus?.connected,
      connectDisabled:
        isLoadingIntegrations ||
        isSavingGoogleDrive ||
        googleDriveStatus?.configured === false ||
        googleDriveStatus?.needsMigration === true,
      connectLabel: "Connect Drive",
      detail:
        googleDriveStatus?.email ||
        googleDriveStatus?.hostedDomain ||
        "Read files and docs for AI workspace research.",
      id: "googleDrive",
      icon: integrationIcons.googleDrive,
      isBusy: isLoadingIntegrations || isSavingGoogleDrive,
      name: "Google Drive",
      onConnect: handleConnectGoogleDrive,
      onManage: () => setSelectedIntegrationId("googleDrive"),
    },
    {
      about:
        "Slack gives Notelab access to the channels, files, canvases, and threads the installed app can see. Personal DMs stay outside this organization connector.",
      category: "AI enterprise search",
      connected: slackStatus?.connected,
      connectDisabled:
        isLoadingIntegrations ||
        isSavingSlack ||
        slackStatus?.configured === false ||
        slackStatus?.needsMigration === true,
      connectLabel: "Connect Slack",
      detail:
        slackStatus?.teamName ||
        slackStatus?.displayName ||
        "Read workspace conversations and shared files.",
      id: "slack",
      icon: integrationIcons.slack,
      isBusy: isLoadingIntegrations || isSavingSlack,
      name: "Slack",
      onConnect: handleConnectSlack,
      onManage: () => setSelectedIntegrationId("slack"),
    },
    {
      about:
        "Linear connects issues, projects, teams, and cycles so Notelab can answer with current product and planning context.",
      category: "AI enterprise search",
      connected: linearStatus?.connected,
      connectDisabled:
        isLoadingIntegrations ||
        isSavingLinear ||
        linearStatus?.configured === false ||
        linearStatus?.needsMigration === true,
      connectLabel: "Connect Linear",
      detail:
        linearStatus?.organizationName ||
        linearStatus?.displayName ||
        "Read planning and delivery context from Linear.",
      id: "linear",
      icon: integrationIcons.linear,
      isBusy: isLoadingIntegrations || isSavingLinear,
      name: "Linear",
      onConnect: handleConnectLinear,
      onManage: () => setSelectedIntegrationId("linear"),
    },
  ];
  const selectedIntegration = integrationSummaries.find(
    (integration) => integration.id === selectedIntegrationId,
  );
  const selectedIntegrationCard =
    selectedIntegrationId === "gmail" ? (
      <GmailIntegrationCard
        isBusy={isLoadingIntegrations || isSavingGmail}
        onConnect={handleConnectGmail}
        onDisconnect={handleDisconnectGmail}
        status={gmailStatus}
      />
    ) : selectedIntegrationId === "github" ? (
      <GithubIntegrationCard
        isBusy={isLoadingIntegrations || isSavingGithub}
        onConnect={handleConnectGithub}
        onDisconnect={handleDisconnectGithub}
        status={githubStatus}
      />
    ) : selectedIntegrationId === "googleCalendar" ? (
      <GoogleCalendarIntegrationCard
        isBusy={isLoadingIntegrations || isSavingGoogleCalendar}
        onConnect={() => void handleConnectGoogleCalendar(false)}
        onDisconnect={handleDisconnectGoogleCalendar}
        onToggleCoworkerAccess={(enabled) => {
          void handleToggleGoogleCalendarCoworkerAccess(enabled);
        }}
        status={googleCalendarStatus}
      />
    ) : selectedIntegrationId === "googleDrive" ? (
      <GoogleDriveIntegrationCard
        isBusy={isLoadingIntegrations || isSavingGoogleDrive}
        onConnect={handleConnectGoogleDrive}
        onDisconnect={handleDisconnectGoogleDrive}
        status={googleDriveStatus}
      />
    ) : selectedIntegrationId === "slack" ? (
      <SlackIntegrationCard
        isBusy={isLoadingIntegrations || isSavingSlack}
        onConnect={handleConnectSlack}
        onDisconnect={handleDisconnectSlack}
        status={slackStatus}
      />
    ) : selectedIntegrationId === "linear" ? (
      <LinearIntegrationCard
        isBusy={isLoadingIntegrations || isSavingLinear}
        onConnect={handleConnectLinear}
        onDisconnect={handleDisconnectLinear}
        status={linearStatus}
      />
    ) : null;

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        description="Connect organization tools that Notelab can use for workspace context."
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
            description="Connect organization tools for AI workspace research."
            title="AI enterprise search"
          >
            {integrationSummaries
              .filter(
                (integration) =>
                  integration.category === "AI enterprise search",
              )
              .map((integration) => (
                <IntegrationGridCard
                  integration={integration}
                  key={integration.id}
                />
              ))}
          </IntegrationSection>
        )}
      </div>
    </main>
  );
}

function GmailIntegrationCard({
  isBusy,
  onConnect,
  onDisconnect,
  status,
}: {
  isBusy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  status: GmailIntegrationStatus | null;
}) {
  const isConnected = status?.connected === true;

  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-xs">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-background">
            <img
              alt=""
              aria-hidden="true"
              className="size-5"
              src={integrationIcons.gmail}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-medium">Gmail</h4>
                <ConnectionBadge status={status} />
              </div>
              <p className="max-w-xl text-sm text-muted-foreground">
                Read organization Gmail messages through the AI interface using
                Gmail read-only access.
              </p>
            </div>
            <div className="grid gap-2 text-sm md:grid-cols-2">
              <IntegrationDetail
                label="Account"
                value={status?.email || "Not connected"}
              />
              <IntegrationDetail
                label="Domain"
                value={status?.hostedDomain || "Not connected"}
              />
              <IntegrationDetail
                label="OAuth"
                value={status?.configured ? "Configured" : "Not configured"}
              />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 md:justify-end">
          {isConnected ? (
            <Button
              disabled={isBusy}
              onClick={onDisconnect}
              type="button"
              variant="destructive"
            >
              {isBusy ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <UnplugIcon />
              )}
              Disconnect
            </Button>
          ) : (
            <Button
              disabled={
                isBusy ||
                status?.configured === false ||
                status?.needsMigration === true
              }
              onClick={onConnect}
              type="button"
            >
              {isBusy ? <Loader2Icon className="animate-spin" /> : <PlugIcon />}
              Connect Gmail
            </Button>
          )}
        </div>
      </div>
      {status?.configured === false ? (
        <Alert className="mt-4" variant="destructive">
          <AlertDescription>
            Google OAuth is not configured on the backend.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function GithubIntegrationCard({
  isBusy,
  onConnect,
  onDisconnect,
  status,
}: {
  isBusy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  status: GithubIntegrationStatus | null;
}) {
  const isConnected = status?.connected === true;

  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-xs">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-background">
            <img
              alt=""
              aria-hidden="true"
              className="size-5"
              src={integrationIcons.github}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-medium">GitHub</h4>
                <ConnectionBadge connected={status?.connected} />
              </div>
              <p className="max-w-xl text-sm text-muted-foreground">
                Read visible GitHub repositories, issues, pull requests,
                commits, and files for AI workspace research.
              </p>
            </div>
            <div className="grid gap-2 text-sm md:grid-cols-2">
              <IntegrationDetail
                label="Account"
                value={
                  status?.connectedUserLogin ||
                  status?.connectedUserName ||
                  status?.displayName ||
                  "Not connected"
                }
              />
              <IntegrationDetail
                label="User ID"
                value={
                  status?.connectedUserId
                    ? String(status.connectedUserId)
                    : status?.providerAccountId || "Not connected"
                }
              />
              <IntegrationDetail
                label="Access"
                value={isConnected ? "Read-only GitHub" : "Not connected"}
              />
              <IntegrationDetail
                label="OAuth"
                value={status?.configured ? "Configured" : "Not configured"}
              />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 md:justify-end">
          {isConnected ? (
            <Button
              disabled={isBusy}
              onClick={onDisconnect}
              type="button"
              variant="destructive"
            >
              {isBusy ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <UnplugIcon />
              )}
              Disconnect
            </Button>
          ) : (
            <Button
              disabled={
                isBusy ||
                status?.configured === false ||
                status?.needsMigration === true
              }
              onClick={onConnect}
              type="button"
            >
              {isBusy ? <Loader2Icon className="animate-spin" /> : <PlugIcon />}
              Connect GitHub
            </Button>
          )}
        </div>
      </div>
      {status?.configured === false ? (
        <Alert className="mt-4" variant="destructive">
          <AlertDescription>
            GitHub OAuth is not configured on the backend.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function GoogleCalendarIntegrationCard({
  isBusy,
  onConnect,
  onDisconnect,
  onToggleCoworkerAccess,
  status,
}: {
  isBusy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleCoworkerAccess: (enabled: boolean) => void;
  status: GoogleCalendarIntegrationStatus | null;
}) {
  const isConnected = status?.connected === true;

  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-xs">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-background">
            <img
              alt=""
              aria-hidden="true"
              className="size-5"
              src={integrationIcons.googleCalendar}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-medium">Google Calendar</h4>
                <ConnectionBadge connected={status?.connected} />
              </div>
              <p className="max-w-xl text-sm text-muted-foreground">
                Read the connected user's Google Calendar for AI scheduling
                context. Coworker availability is a separate opt-in permission.
              </p>
            </div>
            <div className="grid gap-2 text-sm md:grid-cols-2">
              <IntegrationDetail
                label="Account"
                value={status?.email || "Not connected"}
              />
              <IntegrationDetail
                label="Domain"
                value={status?.hostedDomain || "Not verified"}
              />
              <IntegrationDetail
                label="Coworkers"
                value={
                  status?.coworkerCalendarAccessEnabled
                    ? "Availability enabled"
                    : "Personal calendar only"
                }
              />
              <IntegrationDetail
                label="OAuth"
                value={status?.configured ? "Configured" : "Not configured"}
              />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 md:justify-end">
          {isConnected ? (
            <Button
              disabled={isBusy}
              onClick={onDisconnect}
              type="button"
              variant="destructive"
            >
              {isBusy ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <UnplugIcon />
              )}
              Disconnect
            </Button>
          ) : (
            <Button
              disabled={
                isBusy ||
                status?.configured === false ||
                status?.needsMigration === true
              }
              onClick={onConnect}
              type="button"
            >
              {isBusy ? <Loader2Icon className="animate-spin" /> : <PlugIcon />}
              Connect Calendar
            </Button>
          )}
        </div>
      </div>
      {isConnected ? (
        <div className="mt-4 flex items-center justify-between gap-4 rounded-md border bg-background px-3 py-2">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">
              Coworker calendar availability
            </div>
            <div className="text-xs text-muted-foreground">
              Allow AI to check free/busy blocks for other organization
              calendars.
            </div>
          </div>
          <Switch
            checked={status?.coworkerCalendarAccessEnabled === true}
            disabled={isBusy}
            onCheckedChange={onToggleCoworkerAccess}
          />
        </div>
      ) : null}
      {status?.configured === false ? (
        <Alert className="mt-4" variant="destructive">
          <AlertDescription>
            Google OAuth is not configured on the backend.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function GoogleDriveIntegrationCard({
  isBusy,
  onConnect,
  onDisconnect,
  status,
}: {
  isBusy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  status: GoogleDriveIntegrationStatus | null;
}) {
  const isConnected = status?.connected === true;

  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-xs">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-background">
            <img
              alt=""
              aria-hidden="true"
              className="size-5"
              src={integrationIcons.googleDrive}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-medium">Google Drive</h4>
                <ConnectionBadge connected={status?.connected} />
              </div>
              <p className="max-w-xl text-sm text-muted-foreground">
                Read visible Google Drive files, Docs, Sheets, and Slides for AI
                workspace research using read-only access.
              </p>
            </div>
            <div className="grid gap-2 text-sm md:grid-cols-2">
              <IntegrationDetail
                label="Account"
                value={status?.email || "Not connected"}
              />
              <IntegrationDetail
                label="Domain"
                value={status?.hostedDomain || "Not verified"}
              />
              <IntegrationDetail
                label="Access"
                value={isConnected ? "Read-only Drive" : "Not connected"}
              />
              <IntegrationDetail
                label="OAuth"
                value={status?.configured ? "Configured" : "Not configured"}
              />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 md:justify-end">
          {isConnected ? (
            <Button
              disabled={isBusy}
              onClick={onDisconnect}
              type="button"
              variant="destructive"
            >
              {isBusy ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <UnplugIcon />
              )}
              Disconnect
            </Button>
          ) : (
            <Button
              disabled={
                isBusy ||
                status?.configured === false ||
                status?.needsMigration === true
              }
              onClick={onConnect}
              type="button"
            >
              {isBusy ? <Loader2Icon className="animate-spin" /> : <PlugIcon />}
              Connect Drive
            </Button>
          )}
        </div>
      </div>
      {status?.configured === false ? (
        <Alert className="mt-4" variant="destructive">
          <AlertDescription>
            Google OAuth is not configured on the backend.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function SlackIntegrationCard({
  isBusy,
  onConnect,
  onDisconnect,
  status,
}: {
  isBusy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  status: SlackIntegrationStatus | null;
}) {
  const isConnected = status?.connected === true;

  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-xs">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-background">
            <img
              alt=""
              aria-hidden="true"
              className="size-5"
              src={integrationIcons.slack}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-medium">Slack</h4>
                <ConnectionBadge connected={status?.connected} />
              </div>
              <p className="max-w-xl text-sm text-muted-foreground">
                Read organization Slack channels, files, canvases, and threads
                the Notelab app can access. Personal DMs and notifications
                require a separate user-account connector.
              </p>
            </div>
            <div className="grid gap-2 text-sm md:grid-cols-2">
              <IntegrationDetail
                label="Team"
                value={
                  status?.teamName || status?.displayName || "Not connected"
                }
              />
              <IntegrationDetail
                label="Team ID"
                value={
                  status?.teamId || status?.providerAccountId || "Not connected"
                }
              />
              <IntegrationDetail
                label="Install"
                value={
                  status?.isEnterpriseInstall
                    ? "Enterprise install"
                    : "Workspace install"
                }
              />
              <IntegrationDetail
                label="OAuth"
                value={status?.configured ? "Configured" : "Not configured"}
              />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 md:justify-end">
          {isConnected ? (
            <Button
              disabled={isBusy}
              onClick={onDisconnect}
              type="button"
              variant="destructive"
            >
              {isBusy ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <UnplugIcon />
              )}
              Disconnect
            </Button>
          ) : (
            <Button
              disabled={
                isBusy ||
                status?.configured === false ||
                status?.needsMigration === true
              }
              onClick={onConnect}
              type="button"
            >
              {isBusy ? <Loader2Icon className="animate-spin" /> : <PlugIcon />}
              Connect Slack
            </Button>
          )}
        </div>
      </div>
      {status?.configured === false ? (
        <Alert className="mt-4" variant="destructive">
          <AlertDescription>
            Slack OAuth is not configured on the backend.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function LinearIntegrationCard({
  isBusy,
  onConnect,
  onDisconnect,
  status,
}: {
  isBusy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  status: LinearIntegrationStatus | null;
}) {
  const isConnected = status?.connected === true;

  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-xs">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-background">
            <img
              alt=""
              aria-hidden="true"
              className="size-5"
              src={integrationIcons.linear}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-medium">Linear</h4>
                <ConnectionBadge connected={status?.connected} />
              </div>
              <p className="max-w-xl text-sm text-muted-foreground">
                Read organization Linear issues, projects, teams, and cycles
                through the official Linear SDK for AI workspace context.
              </p>
            </div>
            <div className="grid gap-2 text-sm md:grid-cols-2">
              <IntegrationDetail
                label="Workspace"
                value={
                  status?.organizationName ||
                  status?.displayName ||
                  "Not connected"
                }
              />
              <IntegrationDetail
                label="Workspace ID"
                value={
                  status?.organizationId ||
                  status?.providerAccountId ||
                  "Not connected"
                }
              />
              <IntegrationDetail
                label="Connected user"
                value={
                  status?.connectedUserName ||
                  status?.connectedUserEmail ||
                  "Not connected"
                }
              />
              <IntegrationDetail
                label="OAuth"
                value={status?.configured ? "Configured" : "Not configured"}
              />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 md:justify-end">
          {isConnected ? (
            <Button
              disabled={isBusy}
              onClick={onDisconnect}
              type="button"
              variant="destructive"
            >
              {isBusy ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <UnplugIcon />
              )}
              Disconnect
            </Button>
          ) : (
            <Button
              disabled={
                isBusy ||
                status?.configured === false ||
                status?.needsMigration === true
              }
              onClick={onConnect}
              type="button"
            >
              {isBusy ? <Loader2Icon className="animate-spin" /> : <PlugIcon />}
              Connect Linear
            </Button>
          )}
        </div>
      </div>
      {status?.configured === false ? (
        <Alert className="mt-4" variant="destructive">
          <AlertDescription>
            Linear OAuth is not configured on the backend.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function RefreshIntegrationsCard({
  isLoading,
  onRefresh,
}: {
  isLoading: boolean;
  onRefresh: () => void;
}) {
  return (
    <Card>
      <CardHeader className="items-start gap-4 sm:flex-row sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Connections</CardTitle>
          <CardDescription>
            Review connected tools and refresh their current status.
          </CardDescription>
        </div>
        <Button
          disabled={isLoading}
          onClick={onRefresh}
          size="sm"
          type="button"
          variant="outline"
        >
          {isLoading ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <RotateCwIcon />
          )}
          Refresh
        </Button>
      </CardHeader>
    </Card>
  );
}

function IntegrationSection({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-2">{children}</ItemGroup>
      </CardContent>
    </Card>
  );
}

function IntegrationGridCard({
  integration,
}: {
  integration: IntegrationSummary;
}) {
  const isConnected = integration.connected === true;

  return (
    <Item className="min-h-16" variant="outline">
      <ItemMedia className="size-10 rounded-lg border bg-background">
        <img
          alt=""
          aria-hidden="true"
          className="size-5"
          src={integration.icon}
        />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ItemTitle className="truncate">{integration.name}</ItemTitle>
          <ConnectionBadge
            connected={integration.connected}
            status={integration.status}
          />
        </div>
        <ItemDescription className="line-clamp-2">
          {integration.detail}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          disabled={isConnected || integration.connectDisabled}
          onClick={integration.onConnect}
          size="sm"
          type="button"
          variant={isConnected ? "secondary" : "default"}
        >
          {integration.isBusy ? (
            <Loader2Icon className="animate-spin" />
          ) : isConnected ? (
            <CheckCircle2Icon />
          ) : (
            <PlugIcon />
          )}
          {isConnected ? "Connected" : integration.connectLabel}
        </Button>
        <Button
          onClick={integration.onManage}
          size="sm"
          type="button"
          variant="outline"
        >
          Manage
        </Button>
      </ItemActions>
    </Item>
  );
}

function IntegrationDetailShell({
  children,
  integration,
  onBack,
}: {
  children: React.ReactNode;
  integration: IntegrationSummary;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button onClick={onBack} size="sm" type="button" variant="ghost">
          <ArrowLeftIcon />
          Integrations
        </Button>
      </div>
      <div className="space-y-4">
        <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground shadow-xs md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-md border bg-background">
              <img
                alt=""
                aria-hidden="true"
                className="size-6"
                src={integration.icon}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium">{integration.name}</h3>
                <ConnectionBadge
                  connected={integration.connected}
                  status={integration.status}
                />
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {integration.about}
              </p>
            </div>
          </div>
          <Badge variant="outline">{integration.category}</Badge>
        </div>
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-medium">Connection details</h4>
            <p className="text-sm text-muted-foreground">
              Review account information, permissions, and any available
              settings for this integration.
            </p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function ConnectionBadge({
  connected,
  status,
}: {
  connected?: boolean;
  status?: IntegrationStatus | null;
}) {
  if (!status) {
    if (connected === undefined) {
      return <Badge variant="secondary">Loading</Badge>;
    }

    return connected ? (
      <Badge className="gap-1" variant="secondary">
        <CheckCircle2Icon className="size-3" />
        Connected
      </Badge>
    ) : (
      <Badge variant="secondary">Disconnected</Badge>
    );
  }

  if (!status.connected) {
    return <Badge variant="secondary">Disconnected</Badge>;
  }

  return (
    <Badge className="gap-1" variant="secondary">
      <CheckCircle2Icon className="size-3" />
      Connected
    </Badge>
  );
}

function IntegrationDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-background px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 min-w-0 truncate">{value}</div>
    </div>
  );
}
