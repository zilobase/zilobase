export const SLACK_API_BASE_URL = "https://slack.com/api";
export const SLACK_OAUTH_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize";
export const SLACK_OAUTH_ACCESS_URL = `${SLACK_API_BASE_URL}/oauth.v2.access`;

export const SLACK_CONNECTOR_SCOPES = [
  "app_mentions:read",
  "bookmarks:read",
  "canvases:read",
  "channels:history",
  "channels:read",
  "files:read",
  "groups:history",
  "groups:read",
  "pins:read",
  "team:read",
  "usergroups:read",
] as const;
