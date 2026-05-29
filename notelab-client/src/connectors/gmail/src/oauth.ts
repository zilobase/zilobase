import {
  GMAIL_CONNECTOR_SCOPES,
  GOOGLE_OAUTH_AUTH_URL,
  GOOGLE_OAUTH_TOKEN_URL,
} from "./constants.js";
import { GmailConnectorError } from "./errors.js";
import { resolveFetch, type GmailFetch } from "./fetch.js";
import type {
  GmailConnectorScope,
  GmailOAuthTokenResponse,
  GoogleIdTokenClaims,
} from "./types.js";

export type CreateGmailOAuthUrlOptions = {
  clientId: string;
  redirectUri: string;
  state: string;
  hostedDomain?: string;
  loginHint?: string;
  prompt?: "consent" | "none" | "select_account";
  scopes?: readonly GmailConnectorScope[];
};

export function createGmailOAuthUrl({
  clientId,
  redirectUri,
  state,
  hostedDomain,
  loginHint,
  prompt = "consent",
  scopes = GMAIL_CONNECTOR_SCOPES,
}: CreateGmailOAuthUrlOptions) {
  const url = new URL(GOOGLE_OAUTH_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", prompt);

  if (hostedDomain) {
    url.searchParams.set("hd", hostedDomain);
  }

  if (loginHint) {
    url.searchParams.set("login_hint", loginHint);
  }

  return url.toString();
}

export type ExchangeGmailOAuthCodeOptions = {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  fetch?: GmailFetch;
};

export async function exchangeGmailOAuthCode({
  clientId,
  clientSecret,
  code,
  redirectUri,
  fetch: fetchImpl,
}: ExchangeGmailOAuthCodeOptions): Promise<GmailOAuthTokenResponse> {
  const response = await resolveFetch(fetchImpl)(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    throw new GmailConnectorError("Failed to exchange Gmail OAuth code.", {
      code: "GMAIL_OAUTH_EXCHANGE_FAILED",
      status: response.status,
    });
  }

  return response.json() as Promise<GmailOAuthTokenResponse>;
}

export type RefreshGmailAccessTokenOptions = {
  clientId: string;
  clientSecret: string;
  fetch?: GmailFetch;
  refreshToken: string;
};

export async function refreshGmailAccessToken({
  clientId,
  clientSecret,
  fetch: fetchImpl,
  refreshToken,
}: RefreshGmailAccessTokenOptions): Promise<GmailOAuthTokenResponse> {
  const response = await resolveFetch(fetchImpl)(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    throw new GmailConnectorError("Failed to refresh Gmail access token.", {
      code: "GMAIL_OAUTH_REFRESH_FAILED",
      status: response.status,
    });
  }

  return response.json() as Promise<GmailOAuthTokenResponse>;
}

export function decodeGoogleIdTokenClaims(idToken: string): GoogleIdTokenClaims {
  const [, payload] = idToken.split(".");

  if (!payload) {
    throw new GmailConnectorError("Invalid Google ID token.", {
      code: "GMAIL_INVALID_ID_TOKEN",
    });
  }

  try {
    return JSON.parse(decodeBase64Url(payload)) as GoogleIdTokenClaims;
  } catch {
    throw new GmailConnectorError("Invalid Google ID token payload.", {
      code: "GMAIL_INVALID_ID_TOKEN_PAYLOAD",
    });
  }
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );

  if (typeof atob !== "function") {
    throw new GmailConnectorError("Base64 decoding is not available.", {
      code: "GMAIL_BASE64_DECODER_UNAVAILABLE",
    });
  }

  return atob(padded);
}
