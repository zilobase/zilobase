import { browser } from "wxt/browser";

import { writeSession, type ClipperSession } from "./session";

const CLIPPER_CLIENT_ID = "zilobase-web-clipper";
const CLIPPER_OAUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "workspaces.read",
  "pages.read",
  "pages.write",
  "clips.write",
  "databases.read",
  "databases.write",
  "search.read",
].join(" ");

const pendingKey = "clipper.oauth.pending";

type PendingOAuth = {
  apiOrigin: string;
  codeVerifier: string;
  redirectUri: string;
  state: string;
  webOrigin: string;
};

export async function startClipperOAuth(instanceUrl: string) {
  const apiOrigin = instanceUrl.replace(/\/$/, "");
  const discovery = await fetchDiscovery(apiOrigin);
  const webOrigin = discovery.webOrigin.replace(/\/$/, "");
  const redirectUri = `${webOrigin}/oauth/callback`;
  const state = randomUrlToken(24);
  const codeVerifier = randomUrlToken(48);
  const codeChallenge = await s256(codeVerifier);

  await browser.storage.local.set({
    [pendingKey]: {
      apiOrigin,
      codeVerifier,
      redirectUri,
      state,
      webOrigin,
    } satisfies PendingOAuth,
  });

  const authorize = new URL("/api/auth/oauth2/authorize", apiOrigin);
  authorize.searchParams.set("client_id", CLIPPER_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", CLIPPER_OAUTH_SCOPES);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", codeChallenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("resource", apiOrigin);

  await browser.tabs.create({ url: authorize.toString() });
}

export async function completeClipperOAuth(callbackUrl: string) {
  const pending = await readPending();
  if (!pending) {
    throw new Error("No OAuth request is in progress.");
  }

  const url = new URL(callbackUrl);
  if (url.origin !== pending.webOrigin || url.pathname !== "/oauth/callback") {
    return null;
  }

  if (url.searchParams.get("state") !== pending.state) return null;

  const error = url.searchParams.get("error");
  if (error) {
    await browser.storage.local.remove(pendingKey);
    throw new Error(url.searchParams.get("error_description") || error);
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return null;
  }

  const tokens = await exchangeCode(pending, code);
  const workspaceId = readJwtClaim(tokens.access_token, "workspace_id");
  if (!workspaceId) {
    await browser.storage.local.remove(pendingKey);
    throw new Error("The token did not include a workspace. Try connecting again.");
  }

  const session: ClipperSession = {
    instanceUrl: pending.apiOrigin,
    refreshToken: tokens.refresh_token,
    token: tokens.access_token,
    webOrigin: pending.webOrigin,
    workspaceId,
    workspaceName: "Workspace",
  };
  await writeSession(session);
  await browser.storage.local.remove(pendingKey);
  return session;
}

export async function refreshClipperAccessToken(session: ClipperSession) {
  if (!session.refreshToken) {
    return session;
  }

  const body = new URLSearchParams({
    client_id: CLIPPER_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: session.refreshToken,
  });
  const response = await fetch(new URL("/api/auth/oauth2/token", session.instanceUrl), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error("Could not refresh the Zilobase session.");
  }
  const tokens = (await response.json()) as TokenResponse;
  const next: ClipperSession = {
    ...session,
    refreshToken: tokens.refresh_token ?? session.refreshToken,
    token: tokens.access_token,
  };
  await writeSession(next);
  return next;
}

async function fetchDiscovery(apiOrigin: string) {
  const response = await fetch(new URL("/.well-known/zilobase", apiOrigin));
  if (!response.ok) {
    throw new Error(
      `Could not read Zilobase discovery metadata (${response.status}). Use the API origin as Server URL (Node: http://localhost:3000).`,
    );
  }
  const body = (await response.json()) as { webOrigin?: string };
  if (!body.webOrigin) {
    throw new Error("Discovery metadata is missing the web origin.");
  }
  return { webOrigin: body.webOrigin };
}

async function exchangeCode(pending: PendingOAuth, code: string) {
  const body = new URLSearchParams({
    client_id: CLIPPER_CLIENT_ID,
    code,
    code_verifier: pending.codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: pending.redirectUri,
  });
  const response = await fetch(new URL("/api/auth/oauth2/token", pending.apiOrigin), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error("Could not exchange the authorization code.");
  }
  return (await response.json()) as TokenResponse;
}

async function readPending() {
  const stored = await browser.storage.local.get(pendingKey);
  return (stored[pendingKey] as PendingOAuth | undefined) ?? null;
}

function readJwtClaim(token: string, claim: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replaceAll("-", "+").replaceAll("_", "/")));
    const value = json[claim];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

function randomUrlToken(bytes: number) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function s256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
};
