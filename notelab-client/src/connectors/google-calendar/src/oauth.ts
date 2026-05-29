import {
  GOOGLE_CALENDAR_CONNECTOR_SCOPES,
  GOOGLE_OAUTH_AUTH_URL,
  GOOGLE_OAUTH_TOKEN_URL,
} from "./constants.js";
import { GoogleCalendarConnectorError } from "./errors.js";
import { resolveFetch, type GoogleCalendarFetch } from "./fetch.js";
import type {
  GoogleCalendarConnectorScope,
  GoogleCalendarOAuthTokenResponse,
  GoogleIdTokenClaims,
} from "./types.js";

export type CreateGoogleCalendarOAuthUrlOptions = {
  clientId: string;
  redirectUri: string;
  state: string;
  hostedDomain?: string;
  loginHint?: string;
  prompt?: "consent" | "none" | "select_account";
  scopes?: readonly GoogleCalendarConnectorScope[];
};

export function createGoogleCalendarOAuthUrl({
  clientId,
  redirectUri,
  state,
  hostedDomain,
  loginHint,
  prompt = "consent",
  scopes = GOOGLE_CALENDAR_CONNECTOR_SCOPES,
}: CreateGoogleCalendarOAuthUrlOptions) {
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

export type ExchangeGoogleCalendarOAuthCodeOptions = {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  fetch?: GoogleCalendarFetch;
};

export async function exchangeGoogleCalendarOAuthCode({
  clientId,
  clientSecret,
  code,
  redirectUri,
  fetch: fetchImpl,
}: ExchangeGoogleCalendarOAuthCodeOptions): Promise<GoogleCalendarOAuthTokenResponse> {
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
    throw new GoogleCalendarConnectorError(
      "Failed to exchange Google Calendar OAuth code.",
      {
        code: "GOOGLE_CALENDAR_OAUTH_EXCHANGE_FAILED",
        status: response.status,
      },
    );
  }

  return response.json() as Promise<GoogleCalendarOAuthTokenResponse>;
}

export type RefreshGoogleCalendarAccessTokenOptions = {
  clientId: string;
  clientSecret: string;
  fetch?: GoogleCalendarFetch;
  refreshToken: string;
};

export async function refreshGoogleCalendarAccessToken({
  clientId,
  clientSecret,
  fetch: fetchImpl,
  refreshToken,
}: RefreshGoogleCalendarAccessTokenOptions): Promise<GoogleCalendarOAuthTokenResponse> {
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
    throw new GoogleCalendarConnectorError(
      "Failed to refresh Google Calendar access token.",
      {
        code: "GOOGLE_CALENDAR_OAUTH_REFRESH_FAILED",
        status: response.status,
      },
    );
  }

  return response.json() as Promise<GoogleCalendarOAuthTokenResponse>;
}

export function decodeGoogleIdTokenClaims(idToken: string): GoogleIdTokenClaims {
  const [, payload] = idToken.split(".");

  if (!payload) {
    throw new GoogleCalendarConnectorError("Invalid Google ID token.", {
      code: "GOOGLE_CALENDAR_INVALID_ID_TOKEN",
    });
  }

  try {
    return JSON.parse(decodeBase64Url(payload)) as GoogleIdTokenClaims;
  } catch {
    throw new GoogleCalendarConnectorError("Invalid Google ID token payload.", {
      code: "GOOGLE_CALENDAR_INVALID_ID_TOKEN_PAYLOAD",
    });
  }
}

export function getHostedDomainFromClaims(claims: GoogleIdTokenClaims) {
  return claims.hd?.trim() || claims.email?.split("@")[1]?.trim() || undefined;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );

  if (typeof atob !== "function") {
    throw new GoogleCalendarConnectorError("Base64 decoding is not available.", {
      code: "GOOGLE_CALENDAR_BASE64_DECODER_UNAVAILABLE",
    });
  }

  return atob(padded);
}
