import { and, eq, gt, isNull } from "drizzle-orm"

import { db, runWithDbEnv } from "../../infrastructure/database"
import {
  gmailAccount,
  gmailOauthAttempt,
  gmailWorkspaceConnection,
} from "../../infrastructure/database/schema"
import {
  getCanonicalApiOrigin,
  getRequiredStringEnv,
  getStringEnv,
  type RuntimeEnv,
} from "../../shared/config/config"
import { requestSignal } from "../../shared/http/request"
import {
  decryptMailSecret,
  encryptMailSecret,
} from "./security/mail-credentials"
import { verifyGoogleIdToken } from "./security/google-id-token"

const GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_REVOCATION_URL = "https://oauth2.googleapis.com/revoke"
const GMAIL_PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile"
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify"
const GOOGLE_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email"
const REQUIRED_SCOPES = ["openid", "email", GMAIL_SCOPE] as const
const OAUTH_ATTEMPT_TTL_MS = 10 * 60 * 1_000

type OAuthClientKind = "desktop" | "web"

type GoogleTokenResponse = {
  access_token?: string
  expires_in?: number
  id_token?: string
  refresh_token?: string
  scope?: string
  token_type?: string
}

export function gmailProviderConfigured(env: RuntimeEnv) {
  return Boolean(
    getStringEnv(env, "GMAIL_GOOGLE_CLIENT_ID") &&
      getStringEnv(env, "GMAIL_GOOGLE_CLIENT_SECRET") &&
      getStringEnv(env, "GMAIL_TOKEN_ENCRYPTION_KEY"),
  )
}

export async function beginGmailOauth(
  env: RuntimeEnv,
  input: { clientKind: OAuthClientKind; userId: string; workspaceId: string },
) {
  const clientId = getRequiredStringEnv(env, "GMAIL_GOOGLE_CLIENT_ID")
  getRequiredStringEnv(env, "GMAIL_GOOGLE_CLIENT_SECRET")
  const state = randomUrlSafe(32)
  const verifier = randomUrlSafe(64)
  const challenge = bytesToBase64Url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
  )
  const attemptId = crypto.randomUUID()
  const encrypted = await encryptMailSecret(env, verifier, {
    connectionId: attemptId,
    purpose: "oauth_verifier",
    userId: input.userId,
  })
  const now = new Date()
  await db.insert(gmailOauthAttempt).values({
    id: attemptId,
    userId: input.userId,
    workspaceId: input.workspaceId,
    stateHash: await sha256Hex(state),
    codeVerifierCiphertext: encrypted.ciphertext,
    codeVerifierIv: encrypted.iv,
    codeVerifierKeyVersion: encrypted.keyVersion,
    clientKind: input.clientKind,
    returnPath: `/workspaces/${input.workspaceId}/mail`,
    expiresAt: new Date(now.getTime() + OAUTH_ATTEMPT_TTL_MS),
    createdAt: now,
    updatedAt: now,
  })

  return buildGmailAuthorizationUrl(env, {
    challenge,
    clientId,
    state,
  }).toString()
}

export function buildGmailAuthorizationUrl(
  env: RuntimeEnv,
  input: { challenge: string; clientId?: string; state: string },
) {
  const url = new URL(GOOGLE_AUTHORIZATION_URL)
  url.search = new URLSearchParams({
    access_type: "offline",
    client_id: input.clientId ?? getRequiredStringEnv(env, "GMAIL_GOOGLE_CLIENT_ID"),
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    include_granted_scopes: "true",
    prompt: "consent",
    redirect_uri: gmailOauthCallbackUrl(env),
    response_type: "code",
    scope: REQUIRED_SCOPES.join(" "),
    state: input.state,
  }).toString()
  return url
}

export async function completeGmailOauth(
  env: RuntimeEnv,
  input: { code: string; state: string },
  fetcher: typeof fetch = fetch,
) {
  return runWithDbEnv(env, () => completeGmailOauthWithDatabase(env, input, fetcher))
}

async function completeGmailOauthWithDatabase(
  env: RuntimeEnv,
  input: { code: string; state: string },
  fetcher: typeof fetch,
) {
  const stateHash = await sha256Hex(input.state)
  const [attempt] = await db
    .select()
    .from(gmailOauthAttempt)
    .where(
      and(
        eq(gmailOauthAttempt.stateHash, stateHash),
        isNull(gmailOauthAttempt.consumedAt),
        gt(gmailOauthAttempt.expiresAt, new Date()),
      ),
    )
    .limit(1)
  if (!attempt) throw new GmailOauthError("This Gmail connection request has expired.", 400)
  if (!attempt.workspaceId) throw new GmailOauthError("This Gmail connection request is no longer supported.", 400)

  const consumed = await db
    .update(gmailOauthAttempt)
    .set({ consumedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(gmailOauthAttempt.id, attempt.id),
        isNull(gmailOauthAttempt.consumedAt),
      ),
    )
    .returning({ id: gmailOauthAttempt.id })
  if (consumed.length !== 1) throw new GmailOauthError("This Gmail connection request was already used.", 400)

  const verifier = await decryptMailSecret(
    env,
    {
      ciphertext: attempt.codeVerifierCiphertext,
      iv: attempt.codeVerifierIv,
      keyVersion: attempt.codeVerifierKeyVersion,
    },
    {
      connectionId: attempt.id,
      purpose: "oauth_verifier",
      userId: attempt.userId,
    },
  )
  const tokens = await exchangeGoogleCode(env, input.code, verifier, fetcher)
  const scopes = new Set((tokens.scope ?? "").split(/\s+/).filter(Boolean))
  if (!hasRequiredGmailScopes(scopes)) {
    throw new GmailOauthError("Gmail access was not fully granted.", 400)
  }
  if (!tokens.access_token || !tokens.refresh_token || !tokens.id_token) {
    throw new GmailOauthError("Google did not return reusable Gmail access.", 400)
  }

  const [identity, profile] = await Promise.all([
    verifyGoogleIdToken(
      tokens.id_token,
      getRequiredStringEnv(env, "GMAIL_GOOGLE_CLIENT_ID"),
      fetcher,
    ),
    fetchGmailProfile(tokens.access_token, fetcher),
  ])
  if (identity.email !== profile.emailAddress.toLowerCase()) {
    throw new GmailOauthError("Google returned inconsistent Gmail account details.", 400)
  }

  const [existingAccount] = await db
    .select({ id: gmailAccount.id })
    .from(gmailAccount)
    .where(and(
      eq(gmailAccount.userId, attempt.userId),
      eq(gmailAccount.googleSubject, identity.subject),
    ))
    .limit(1)
  const connectionId = existingAccount?.id ?? crypto.randomUUID()
  let encrypted = await encryptMailSecret(env, tokens.refresh_token, {
    connectionId,
    purpose: "refresh_token",
    userId: attempt.userId,
  })
  const now = new Date()
  const [account] = await db
    .insert(gmailAccount)
    .values({
      id: connectionId,
      userId: attempt.userId,
      googleSubject: identity.subject,
      email: profile.emailAddress.toLowerCase(),
      scopes: [...scopes].sort(),
      refreshTokenCiphertext: encrypted.ciphertext,
      refreshTokenIv: encrypted.iv,
      refreshTokenKeyVersion: encrypted.keyVersion,
      status: "connected",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [gmailAccount.userId, gmailAccount.googleSubject],
      set: {
        email: profile.emailAddress.toLowerCase(),
        scopes: [...scopes].sort(),
        refreshTokenCiphertext: encrypted.ciphertext,
        refreshTokenIv: encrypted.iv,
        refreshTokenKeyVersion: encrypted.keyVersion,
        status: "connected",
        notificationHistoryId: null,
        mailboxRevision: 0,
        watchExpiresAt: null,
        lastWatchAt: null,
        lastErrorCode: null,
        updatedAt: now,
      },
    })
    .returning({ id: gmailAccount.id })
  if (!account) throw new GmailOauthError("The Gmail account could not be saved.", 500)
  if (account.id !== connectionId) {
    encrypted = await encryptMailSecret(env, tokens.refresh_token, {
      connectionId: account.id,
      purpose: "refresh_token",
      userId: attempt.userId,
    })
    await db
      .update(gmailAccount)
      .set({
        refreshTokenCiphertext: encrypted.ciphertext,
        refreshTokenIv: encrypted.iv,
        refreshTokenKeyVersion: encrypted.keyVersion,
        updatedAt: now,
      })
      .where(eq(gmailAccount.id, account.id))
  }

  await db
    .insert(gmailWorkspaceConnection)
    .values({
      id: crypto.randomUUID(),
      workspaceId: attempt.workspaceId,
      userId: attempt.userId,
      gmailAccountId: account.id,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        gmailWorkspaceConnection.workspaceId,
        gmailWorkspaceConnection.userId,
      ],
      set: { gmailAccountId: account.id, updatedAt: now },
    })
  return {
    clientKind: attempt.clientKind as OAuthClientKind,
    connectionId: account.id,
    workspaceId: attempt.workspaceId,
  }
}

export function hasRequiredGmailScopes(scopes: ReadonlySet<string>) {
  return scopes.has("openid") &&
    (scopes.has("email") || scopes.has(GOOGLE_EMAIL_SCOPE)) &&
    scopes.has(GMAIL_SCOPE)
}

export async function revokeGmailConnection(
  env: RuntimeEnv,
  connection: typeof gmailAccount.$inferSelect,
  fetcher: typeof fetch = fetch,
) {
  try {
    const token = await decryptMailSecret(
      env,
      {
        ciphertext: connection.refreshTokenCiphertext,
        iv: connection.refreshTokenIv,
        keyVersion: connection.refreshTokenKeyVersion,
      },
      {
        connectionId: connection.id,
        purpose: "refresh_token",
        userId: connection.userId,
      },
    )
    await fetcher(GOOGLE_REVOCATION_URL, {
      body: new URLSearchParams({ token }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
      signal: requestSignal(5_000),
    })
  } catch {
    // Local deletion must not depend on Google's availability.
  }
}

export function gmailOauthCallbackUrl(env: RuntimeEnv) {
  return new URL("/mail/oauth/google/callback", getCanonicalApiOrigin(env)).toString()
}

async function exchangeGoogleCode(
  env: RuntimeEnv,
  code: string,
  verifier: string,
  fetcher: typeof fetch,
) {
  const response = await fetcher(GOOGLE_TOKEN_URL, {
    body: new URLSearchParams({
      client_id: getRequiredStringEnv(env, "GMAIL_GOOGLE_CLIENT_ID"),
      client_secret: getRequiredStringEnv(env, "GMAIL_GOOGLE_CLIENT_SECRET"),
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: gmailOauthCallbackUrl(env),
    }),
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
    signal: requestSignal(10_000),
  })
  const body = (await response.json().catch(() => ({}))) as GoogleTokenResponse
  if (!response.ok) throw new GmailOauthError("Google rejected the Gmail connection.", 400)
  return body
}

async function fetchGmailProfile(accessToken: string, fetcher: typeof fetch) {
  const response = await fetcher(GMAIL_PROFILE_URL, {
    headers: { accept: "application/json", authorization: `Bearer ${accessToken}` },
    signal: requestSignal(10_000),
  })
  const body = (await response.json().catch(() => ({}))) as { emailAddress?: string }
  if (!response.ok || !body.emailAddress) {
    throw new GmailOauthError("The Gmail profile could not be loaded.", 400)
  }
  return { emailAddress: body.emailAddress }
}

function randomUrlSafe(bytes: number) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(bytes)))
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

export class GmailOauthError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = "GmailOauthError"
  }
}
