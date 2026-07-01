import type { LINEAR_CONNECTOR_SCOPES } from "./constants.js";

export type LinearConnectorScope =
  | (typeof LINEAR_CONNECTOR_SCOPES)[number]
  | "write"
  | "issues:create"
  | "comments:create"
  | "timeSchedule:write"
  | "admin"
  | string;

export type LinearOAuthTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string | string[];
  token_type?: string;
};

export type LinearWorkspaceSummary = {
  id: string;
  name?: string;
  urlKey?: string;
};

export type LinearViewerSummary = {
  displayName?: string;
  email?: string;
  id: string;
  name?: string;
};
