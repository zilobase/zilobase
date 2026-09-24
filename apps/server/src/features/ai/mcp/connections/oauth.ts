import { safeAgentReturnPath } from "./oauth-return";
import {
  discoverOAuthServerInfo,
  exchangeAuthorization,
  startAuthorization,
  type OAuthClientMetadata,
} from "@modelcontextprotocol/client";
import { and, eq, gt, isNull, ne } from "drizzle-orm";

import { db } from "../../../../infrastructure/database";
import {
  aiMcpConnection,
  aiMcpCredential,
  aiMcpOauthAttempt,
} from "../../../../infrastructure/database/schema";
import { getCanonicalApiOrigin, type RuntimeEnv } from "../../../../shared/config/config";
import { getMembership } from "../../../access";
import { decryptMcpSecret, encryptMcpSecret } from "./credential-crypto";
import { discoverConnectionTools } from "../transport/mcp-client";
import { McpServiceError } from "../transport/mcp-errors";
import {
  getMcpCredentialScopeId,
  getMcpScopeFromConnection,
  requireMcpScopeAccess,
  type McpScope,
} from "../mcp-scope";
import { createSecureMcpFetch } from "../transport/secure-egress";

import { loadClientRegistration, resolveClientInformation } from "./oauth-credentials";

const OAUTH_ATTEMPT_TTL_MS = 10 * 60 * 1_000;

export async function beginMcpOAuth(input: {
  returnTo?: string | null;
  connectionId: string;
  env: RuntimeEnv;
  userId: string;
  workspaceId: string;
  scope: McpScope;
}) {
  const connection = await requireOAuthConnection(input);
  const fetchFn = createSecureMcpFetch({
    approvedUrls: new Set(),
    allowAnyPublicHttps: true,
  });
  const discovered = await discoverOAuthServerInfo(connection.endpointUrl, {
    fetchFn,
  });
  if (!discovered.authorizationServerMetadata) {
    throw new McpServiceError(
      "mcp_oauth_discovery_failed",
      "The server did not publish valid OAuth metadata.",
      409,
    );
  }
  const issuer = discovered.authorizationServerMetadata.issuer;
  if (!issuer)
    throw new McpServiceError("mcp_oauth_issuer_missing", "OAuth issuer is missing.", 409);
  const redirectUri = `${getCanonicalApiOrigin(input.env)}/api/ai/mcp/oauth/callback`;
  const clientMetadata: OAuthClientMetadata = {
    client_name: "Zilobase",
    grant_types: ["authorization_code", "refresh_token"],
    redirect_uris: [redirectUri],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
  const clientInformation = await resolveClientInformation({
    clientMetadata,
    connection,
    env: input.env,
    fetchFn,
    issuer,
    metadata: discovered.authorizationServerMetadata,
  });
  const state = randomUrlSafe(32);
  const started = await startAuthorization(discovered.authorizationServerUrl, {
    clientInformation,
    metadata: discovered.authorizationServerMetadata,
    redirectUrl: redirectUri,
    resource: new URL(connection.endpointUrl),
    state,
  });
  const encryptedVerifier = await encryptMcpSecret(input.env, started.codeVerifier, {
    authenticatedByUserId: input.userId,
    connectionId: connection.id,
    profileId: getMcpCredentialScopeId(connection),
    purpose: "oauth_code_verifier",
    workspaceId: connection.workspaceId,
  });
  const now = new Date();
  await db.insert(aiMcpOauthAttempt).values({
    codeVerifierAuthTag: encryptedVerifier.authTag,
    codeVerifierCiphertext: encryptedVerifier.ciphertext,
    codeVerifierIv: encryptedVerifier.iv,
    connectionId: connection.id,
    createdAt: now,
    expiresAt: new Date(now.getTime() + OAUTH_ATTEMPT_TTL_MS),
    id: crypto.randomUUID(),
    issuer,
    keyVersion: encryptedVerifier.keyVersion,
    redirectUri,
    stateHash: await sha256(state),
    returnTo: safeAgentReturnPath(input.returnTo),
  });
  return {
    authorizationUrl: started.authorizationUrl.toString(),
    expiresAt: new Date(now.getTime() + OAUTH_ATTEMPT_TTL_MS),
  };
}

export async function completeMcpOAuth(input: {
  code: string;
  env: RuntimeEnv;
  iss?: string;
  state: string;
}) {
  const stateHash = await sha256(input.state);
  const [record] = await db
    .select({
      attempt: aiMcpOauthAttempt,
      connection: aiMcpConnection,
    })
    .from(aiMcpOauthAttempt)
    .innerJoin(aiMcpConnection, eq(aiMcpConnection.id, aiMcpOauthAttempt.connectionId))
    .where(
      and(
        eq(aiMcpOauthAttempt.stateHash, stateHash),
        isNull(aiMcpOauthAttempt.consumedAt),
        gt(aiMcpOauthAttempt.expiresAt, new Date()),
        ne(aiMcpConnection.state, "disabled"),
      ),
    )
    .limit(1);
  if (!record)
    throw new McpServiceError(
      "mcp_oauth_state_invalid",
      "OAuth request is invalid or expired.",
      409,
    );
  const [consumed] = await db
    .update(aiMcpOauthAttempt)
    .set({ consumedAt: new Date() })
    .where(and(eq(aiMcpOauthAttempt.id, record.attempt.id), isNull(aiMcpOauthAttempt.consumedAt)))
    .returning({ id: aiMcpOauthAttempt.id });
  if (!consumed)
    throw new McpServiceError("mcp_oauth_state_replayed", "OAuth request was already used.", 409);
  if (!(await isOAuthAuthenticatorEligible(record.connection))) {
    await db
      .update(aiMcpConnection)
      .set({
        lastErrorCode: "authenticator_inactive",
        state: "reconnect_required",
        updatedAt: new Date(),
      })
      .where(eq(aiMcpConnection.id, record.connection.id));
    throw new McpServiceError(
      "mcp_oauth_authenticator_inactive",
      "The connection authenticator is no longer eligible.",
      409,
    );
  }

  const fetchFn = createSecureMcpFetch({
    approvedUrls: new Set(),
    allowAnyPublicHttps: true,
  });
  const discovered = await discoverOAuthServerInfo(record.connection.endpointUrl, { fetchFn });
  const metadata = discovered.authorizationServerMetadata;
  if (!metadata?.issuer || metadata.issuer !== record.attempt.issuer) {
    throw new McpServiceError(
      "mcp_oauth_issuer_changed",
      "OAuth issuer changed during authorization.",
      409,
    );
  }
  const registration = await loadClientRegistration(record.connection, metadata.issuer, input.env);
  const verifier = await decryptMcpSecret(
    input.env,
    {
      authTag: record.attempt.codeVerifierAuthTag,
      ciphertext: record.attempt.codeVerifierCiphertext,
      iv: record.attempt.codeVerifierIv,
      keyVersion: record.attempt.keyVersion,
    },
    {
      authenticatedByUserId: record.connection.authenticatedByUserId,
      connectionId: record.connection.id,
      profileId: getMcpCredentialScopeId(record.connection),
      purpose: "oauth_code_verifier",
      workspaceId: record.connection.workspaceId,
    },
  );
  const tokens = await exchangeAuthorization(discovered.authorizationServerUrl, {
    authorizationCode: input.code,
    clientInformation: registration,
    codeVerifier: verifier,
    fetchFn,
    iss: input.iss,
    metadata,
    redirectUri: record.attempt.redirectUri,
    resource: new URL(record.connection.endpointUrl),
  });
  const tokenExpiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1_000)
    : null;
  const credentialPayload = {
    accessToken: tokens.access_token,
    expiresAt: tokenExpiresAt?.toISOString(),
    issuer: metadata.issuer,
    kind: "oauth",
    refreshToken: tokens.refresh_token,
    scope: tokens.scope,
    tokenType: tokens.token_type,
  };
  const encrypted = await encryptMcpSecret(input.env, JSON.stringify(credentialPayload), {
    authenticatedByUserId: record.connection.authenticatedByUserId,
    connectionId: record.connection.id,
    profileId: getMcpCredentialScopeId(record.connection),
    purpose: "connection_auth",
    workspaceId: record.connection.workspaceId,
  });
  const now = new Date();
  await db
    .insert(aiMcpCredential)
    .values({
      ...encrypted,
      connectionId: record.connection.id,
      createdAt: now,
      expiresAt: tokenExpiresAt,
      secretPurpose: "connection_auth",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: { ...encrypted, expiresAt: tokenExpiresAt, updatedAt: now },
      target: aiMcpCredential.connectionId,
    });
  try {
    await discoverConnectionTools({
      connectionId: record.connection.id,
      env: input.env,
    });
  } catch {
    // The connection state describes the safe failure and the user can retry discovery.
  }
  return record.connection;
}

async function isOAuthAuthenticatorEligible(connection: typeof aiMcpConnection.$inferSelect) {
  return !(
    !(await getMembership(connection.workspaceId, connection.authenticatedByUserId)) ||
    !(await requireMcpScopeAccess({
      minimum: "editor",
      scope: getMcpScopeFromConnection(connection),
      userId: connection.authenticatedByUserId,
      workspaceId: connection.workspaceId,
    })
      .then(() => true)
      .catch(() => false))
  );
}

export async function getMcpOAuthCallbackScope(state: string) {
  const [record] = await db
    .select({ connection: aiMcpConnection })
    .from(aiMcpOauthAttempt)
    .innerJoin(aiMcpConnection, eq(aiMcpConnection.id, aiMcpOauthAttempt.connectionId))
    .where(eq(aiMcpOauthAttempt.stateHash, await sha256(state)))
    .limit(1);
  return record ? getMcpScopeFromConnection(record.connection) : null;
}

async function requireOAuthConnection(input: {
  connectionId: string;
  scope: McpScope;
  userId: string;
  workspaceId: string;
}) {
  await requireMcpScopeAccess({
    minimum: "editor",
    scope: input.scope,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  const [connection] = await db
    .select()
    .from(aiMcpConnection)
    .where(
      and(
        eq(aiMcpConnection.id, input.connectionId),
        eq(aiMcpConnection.scopeType, input.scope.type),
        input.scope.type === "agent"
          ? eq(aiMcpConnection.agentProfileId, input.scope.agentProfileId)
          : eq(aiMcpConnection.scopeUserId, input.scope.userId),
        eq(aiMcpConnection.workspaceId, input.workspaceId),
        eq(aiMcpConnection.authenticatedByUserId, input.userId),
        eq(aiMcpConnection.authMethod, "oauth"),
        ne(aiMcpConnection.state, "disabled"),
      ),
    )
    .limit(1);
  if (!connection)
    throw new McpServiceError("mcp_connection_not_found", "OAuth connection not found.", 404);
  return connection;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomUrlSafe(size: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function getMcpOAuthReturnPath(state: string) {
  const [row] = await db
    .select({ returnTo: aiMcpOauthAttempt.returnTo })
    .from(aiMcpOauthAttempt)
    .where(
      and(
        eq(aiMcpOauthAttempt.stateHash, await sha256(state)),
        gt(aiMcpOauthAttempt.expiresAt, new Date()),
        isNull(aiMcpOauthAttempt.consumedAt),
      ),
    )
    .limit(1);
  return safeAgentReturnPath(row?.returnTo);
}
export async function cancelMcpOAuth(state: string) {
  await db
    .update(aiMcpOauthAttempt)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(aiMcpOauthAttempt.stateHash, await sha256(state)),
        isNull(aiMcpOauthAttempt.consumedAt),
      ),
    );
}
