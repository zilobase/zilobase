import {
  SLACK_CONNECTOR_SCOPES,
  SLACK_OAUTH_ACCESS_URL,
  SLACK_OAUTH_AUTHORIZE_URL,
} from "./constants.js";
import { SlackConnectorError } from "./errors.js";
import { resolveFetch, type SlackFetch } from "./fetch.js";
import type { SlackConnectorScope, SlackOAuthTokenResponse } from "./types.js";

export type CreateSlackOAuthUrlOptions = {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: readonly SlackConnectorScope[];
  team?: string;
};

export function createSlackOAuthUrl({
  clientId,
  redirectUri,
  scopes = SLACK_CONNECTOR_SCOPES,
  state,
  team,
}: CreateSlackOAuthUrlOptions) {
  const url = new URL(SLACK_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes.join(","));
  url.searchParams.set("state", state);

  if (team) {
    url.searchParams.set("team", team);
  }

  return url.toString();
}

export type ExchangeSlackOAuthCodeOptions = {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  fetch?: SlackFetch;
};

export async function exchangeSlackOAuthCode({
  clientId,
  clientSecret,
  code,
  fetch: fetchImpl,
  redirectUri,
}: ExchangeSlackOAuthCodeOptions): Promise<SlackOAuthTokenResponse> {
  const token = await postSlackOAuth({
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    clientId,
    clientSecret,
    fetch: fetchImpl,
    errorMessage: "Failed to exchange Slack OAuth code.",
    errorCode: "SLACK_OAUTH_EXCHANGE_FAILED",
  });

  return token;
}

export type RefreshSlackAccessTokenOptions = {
  clientId: string;
  clientSecret: string;
  fetch?: SlackFetch;
  refreshToken: string;
};

export async function refreshSlackAccessToken({
  clientId,
  clientSecret,
  fetch: fetchImpl,
  refreshToken,
}: RefreshSlackAccessTokenOptions): Promise<SlackOAuthTokenResponse> {
  return postSlackOAuth({
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    clientId,
    clientSecret,
    fetch: fetchImpl,
    errorMessage: "Failed to refresh Slack access token.",
    errorCode: "SLACK_OAUTH_REFRESH_FAILED",
  });
}

async function postSlackOAuth({
  body,
  clientId,
  clientSecret,
  errorCode,
  errorMessage,
  fetch: fetchImpl,
}: {
  body: URLSearchParams;
  clientId: string;
  clientSecret: string;
  errorCode: string;
  errorMessage: string;
  fetch?: SlackFetch;
}) {
  const response = await resolveFetch(fetchImpl)(SLACK_OAUTH_ACCESS_URL, {
    method: "POST",
    body,
    headers: {
      authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    throw new SlackConnectorError(errorMessage, {
      code: errorCode,
      status: response.status,
    });
  }

  const token = (await response.json()) as SlackOAuthTokenResponse;

  if (!token.ok) {
    throw new SlackConnectorError(errorMessage, {
      code: token.error ?? errorCode,
      status: response.status,
    });
  }

  return token;
}
