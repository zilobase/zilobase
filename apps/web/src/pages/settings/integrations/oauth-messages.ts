import type { IntegrationId } from "./types";

type OAuthCallbackResult = {
  integration: IntegrationId;
  message: string;
  status: "error" | "success";
};

const oauthMessages: Record<IntegrationId, Record<string, string>> = {
  gmail: {
    admin_required:
      "Only workspace admins can connect the Gmail page.",
    connected: "Gmail connected.",
    consumer_google_account:
      "Use a paid Google Page account, not Gmail.com.",
    email_mismatch:
      "Use the Gmail account with the same email as your Notelab workspace account.",
    email_not_allowed:
      "The connected Google email must be a member or pending invite in this workspace.",
    email_not_in_workspace:
      "The connected Google email must be a member or pending invite in this workspace.",
    gmail_page_mismatch:
      "Use a Gmail account from the connected Google Page domain.",
    gmail_page_not_connected: "Ask an admin to connect Gmail first.",
    invalid_id_token: "Google could not verify the connected account.",
    invalid_oauth_state: "The Gmail connection expired. Try connecting again.",
    google_oauth_not_configured: "Google OAuth is not configured.",
    google_page_domain_required:
      "Use a Google Page account with a hosted domain.",
    missing_hosted_domain:
      "Use a Google Page account with a hosted workspace domain.",
    unauthorized: "Sign in again before connecting Gmail.",
  },
  github: {
    admin_required:
      "Only workspace admins can connect the GitHub workspace.",
    connected: "GitHub connected.",
    email_mismatch:
      "Use the GitHub account with the same email as your Notelab workspace account.",
    github_admin_required:
      "Use a GitHub account that can administer this workspace.",
    github_membership_required:
      "Use a GitHub account that belongs to the connected GitHub workspace.",
    github_not_configured: "GitHub OAuth is not configured.",
    github_workspace_required:
      "Enter the GitHub workspace login before connecting.",
    github_page_mismatch:
      "Use a GitHub account from the connected GitHub workspace.",
    github_page_not_connected:
      "Ask an admin to connect the GitHub workspace first.",
    invalid_oauth_state: "The GitHub connection expired. Try connecting again.",
    missing_access_token: "GitHub did not return an access token.",
    oauth_callback_failed: "GitHub connection failed during OAuth.",
    unauthorized: "Sign in again before connecting GitHub.",
  },
  googleCalendar: {
    admin_required:
      "Only workspace admins can connect the Google Calendar page.",
    connected: "Google Calendar connected.",
    email_mismatch:
      "Use the Google account with the same email as your Notelab workspace account.",
    google_calendar_page_mismatch:
      "Use a Google account from the connected Google Page domain.",
    google_calendar_page_not_connected:
      "Ask an admin to connect Google Calendar first.",
    google_oauth_not_configured: "Google OAuth is not configured.",
    google_page_domain_required:
      "Use a Google Page account with a hosted domain.",
    invalid_id_token: "Google could not verify the connected account.",
    invalid_oauth_state:
      "The Google Calendar connection expired. Try connecting again.",
    missing_id_token: "Google did not return an identity token.",
    oauth_callback_failed: "Google Calendar connection failed during OAuth.",
    unauthorized: "Sign in again before connecting Google Calendar.",
    unverified_email: "Google could not verify the connected email.",
  },
  googleDrive: {
    admin_required:
      "Only workspace admins can connect the Google Drive page.",
    connected: "Google Drive connected.",
    email_mismatch:
      "Use the Google account with the same email as your Notelab workspace account.",
    google_drive_page_mismatch:
      "Use a Google account from the connected Google Page domain.",
    google_drive_page_not_connected:
      "Ask an admin to connect Google Drive first.",
    google_oauth_not_configured: "Google OAuth is not configured.",
    google_page_domain_required:
      "Use a Google Page account with a hosted domain.",
    invalid_id_token: "Google could not verify the connected account.",
    invalid_oauth_state:
      "The Google Drive connection expired. Try connecting again.",
    missing_id_token: "Google did not return an identity token.",
    oauth_callback_failed: "Google Drive connection failed during OAuth.",
    unauthorized: "Sign in again before connecting Google Drive.",
    unverified_email: "Google could not verify the connected email.",
  },
  slack: {
    admin_required: "Only workspace admins can connect the Slack page.",
    connected: "Slack connected.",
    email_mismatch:
      "Use the Slack account with the same email as your Notelab workspace account.",
    invalid_oauth_state: "The Slack connection expired. Try connecting again.",
    missing_access_token: "Slack did not return an app access token.",
    oauth_callback_failed: "Slack connection failed during OAuth.",
    slack_not_configured: "Slack OAuth is not configured.",
    slack_page_mismatch:
      "Use a Slack account from the connected Slack page.",
    slack_page_not_connected:
      "Ask an admin to connect the Slack page first.",
    unauthorized: "Sign in again before connecting Slack.",
  },
  linear: {
    admin_required: "Only workspace admins can connect the Linear page.",
    connected: "Linear connected.",
    email_mismatch:
      "Use the Linear account with the same email as your Notelab workspace account.",
    invalid_oauth_state: "The Linear connection expired. Try connecting again.",
    linear_not_configured: "Linear OAuth is not configured.",
    linear_page_mismatch:
      "Use a Linear account from the connected Linear page.",
    linear_page_not_connected:
      "Ask an admin to connect the Linear page first.",
    missing_access_token: "Linear did not return an access token.",
    oauth_callback_failed: "Linear connection failed during OAuth.",
    unauthorized: "Sign in again before connecting Linear.",
  },
};

const defaultMessages: Record<
  IntegrationId,
  { error: string; success: string }
> = {
  gmail: {
    error: "Gmail connection failed.",
    success: "Gmail connected.",
  },
  github: {
    error: "GitHub connection failed.",
    success: "GitHub connected.",
  },
  googleCalendar: {
    error: "Google Calendar connection failed.",
    success: "Google Calendar connected.",
  },
  googleDrive: {
    error: "Google Drive connection failed.",
    success: "Google Drive connected.",
  },
  slack: {
    error: "Slack connection failed.",
    success: "Slack connected.",
  },
  linear: {
    error: "Linear connection failed.",
    success: "Linear connected.",
  },
};

const integrationParamNames: IntegrationId[] = [
  "gmail",
  "github",
  "googleCalendar",
  "googleDrive",
  "slack",
  "linear",
];

export function readOAuthCallbackResult(
  params: URLSearchParams,
): OAuthCallbackResult | null {
  const integration = integrationParamNames.find((name) => params.get(name));

  if (!integration) {
    return null;
  }

  const statusParam = params.get(integration);
  const status = statusParam === "success" ? "success" : "error";
  const code = params.get("code") || "";
  const message =
    oauthMessages[integration][code] || defaultMessages[integration][status];

  return { integration, message, status };
}

export function clearOAuthCallbackParams(params: URLSearchParams) {
  for (const integration of integrationParamNames) {
    params.delete(integration);
  }

  params.delete("code");

  if (params.get("settings") === "integrations") {
    params.delete("settings");
  }
}
