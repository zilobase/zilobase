import {
  discoverOAuthServerInfo,
  refreshAuthorization,
  registerClient,
  type OAuthClientInformationMixed,
  type OAuthClientMetadata,
} from "@modelcontextprotocol/client";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../infrastructure/database";
import {
  aiMcpClientRegistration,
  aiMcpConnection,
  aiMcpCredential,
} from "../../../../infrastructure/database/schema";
import {
  getCanonicalApiOrigin,
  getStringEnv,
  type RuntimeEnv,
} from "../../../../shared/config/config";
import { decryptMcpSecret, encryptMcpSecret } from "./credential-crypto";
import { McpServiceError } from "../transport/mcp-errors";
import { getMcpCredentialScopeId } from "../mcp-scope";
import { createSecureMcpFetch } from "../transport/secure-egress";

export function getMcpClientMetadata(env: RuntimeEnv) {
  const redirectUri = `${getCanonicalApiOrigin(env)}/api/ai/mcp/oauth/callback`;
  return {
    client_name: "Zilobase",
    grant_types: ["authorization_code", "refresh_token"],
    redirect_uris: [redirectUri],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}

export async function refreshStoredMcpOAuthCredential(input: {
  connection: typeof aiMcpConnection.$inferSelect;
  credential: {
    accessToken: string;
    expiresAt?: string;
    issuer: string;
    kind: "oauth";
    refreshToken: string;
    scope?: string;
    tokenType?: string;
  };
  env: RuntimeEnv;
}) {
  const fetchFn = createSecureMcpFetch({
    approvedUrls: new Set(),
    allowAnyPublicHttps: true,
  });
  const discovered = await discoverOAuthServerInfo(input.connection.endpointUrl, { fetchFn });
  const metadata = discovered.authorizationServerMetadata;
  if (!metadata?.issuer || metadata.issuer !== input.credential.issuer) {
    throw new McpServiceError(
      "mcp_oauth_issuer_changed",
      "OAuth issuer changed before token refresh.",
      409,
    );
  }
  const registration = await loadClientRegistration(input.connection, metadata.issuer, input.env);
  const tokens = await refreshAuthorization(discovered.authorizationServerUrl, {
    clientInformation: registration,
    fetchFn,
    metadata,
    refreshToken: input.credential.refreshToken,
    resource: new URL(input.connection.endpointUrl),
  });
  const tokenExpiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1_000)
    : null;
  const credential = {
    accessToken: tokens.access_token,
    expiresAt: tokenExpiresAt?.toISOString(),
    issuer: metadata.issuer,
    kind: "oauth" as const,
    refreshToken: tokens.refresh_token ?? input.credential.refreshToken,
    scope: tokens.scope ?? input.credential.scope,
    tokenType: tokens.token_type,
  };
  const encrypted = await encryptMcpSecret(input.env, JSON.stringify(credential), {
    authenticatedByUserId: input.connection.authenticatedByUserId,
    connectionId: input.connection.id,
    profileId: getMcpCredentialScopeId(input.connection),
    purpose: "connection_auth",
    workspaceId: input.connection.workspaceId,
  });
  await db
    .update(aiMcpCredential)
    .set({
      ...encrypted,
      expiresAt: tokenExpiresAt,
      updatedAt: new Date(),
    })
    .where(eq(aiMcpCredential.connectionId, input.connection.id));
  return credential;
}

export async function revokeStoredMcpOAuthCredential(input: {
  connection: typeof aiMcpConnection.$inferSelect;
  env: RuntimeEnv;
}) {
  const [stored] = await db
    .select()
    .from(aiMcpCredential)
    .where(eq(aiMcpCredential.connectionId, input.connection.id))
    .limit(1);
  if (!stored) return;
  const plaintext = await decryptMcpSecret(
    input.env,
    {
      authTag: stored.authTag,
      ciphertext: stored.ciphertext,
      iv: stored.iv,
      keyVersion: stored.keyVersion,
    },
    {
      authenticatedByUserId: input.connection.authenticatedByUserId,
      connectionId: input.connection.id,
      profileId: getMcpCredentialScopeId(input.connection),
      purpose: stored.secretPurpose,
      workspaceId: input.connection.workspaceId,
    },
  );
  const credential = JSON.parse(plaintext) as {
    accessToken?: string;
    issuer?: string;
    kind?: string;
    refreshToken?: string;
  };
  if (credential.kind !== "oauth" || !credential.issuer) return;
  const fetchFn = createSecureMcpFetch({
    approvedUrls: new Set(),
    allowAnyPublicHttps: true,
  });
  const discovered = await discoverOAuthServerInfo(input.connection.endpointUrl, { fetchFn });
  const metadata = discovered.authorizationServerMetadata;
  const revocationEndpoint = readRevocationEndpoint(metadata);
  if (!metadata?.issuer || metadata.issuer !== credential.issuer || !revocationEndpoint) return;
  const registration = await loadClientRegistration(input.connection, metadata.issuer, input.env);
  await revokeTokens(fetchFn, revocationEndpoint, registration, credential);
}

function readRevocationEndpoint(
  metadata: Awaited<ReturnType<typeof discoverOAuthServerInfo>>["authorizationServerMetadata"],
) {
  return metadata &&
    "revocation_endpoint" in metadata &&
    typeof metadata.revocation_endpoint === "string"
    ? metadata.revocation_endpoint
    : null;
}

export async function resolveClientInformation(input: {
  clientMetadata: OAuthClientMetadata;
  connection: typeof aiMcpConnection.$inferSelect;
  env: RuntimeEnv;
  fetchFn: ReturnType<typeof createSecureMcpFetch>;
  issuer: string;
  metadata: NonNullable<
    Awaited<ReturnType<typeof discoverOAuthServerInfo>>["authorizationServerMetadata"]
  >;
}) {
  const [existing] = await db
    .select()
    .from(aiMcpClientRegistration)
    .where(
      and(
        eq(aiMcpClientRegistration.connectionId, input.connection.id),
        eq(aiMcpClientRegistration.issuer, input.issuer),
      ),
    )
    .limit(1);
  if (existing) return loadClientRegistration(input.connection, input.issuer, input.env);

  const clientInformation = await registerConfiguredClient(input);

  const clientSecret =
    "client_secret" in clientInformation ? clientInformation.client_secret : undefined;
  const encryptedSecret = clientSecret
    ? await encryptMcpSecret(input.env, clientSecret, {
        authenticatedByUserId: input.connection.authenticatedByUserId,
        connectionId: input.connection.id,
        profileId: getMcpCredentialScopeId(input.connection),
        purpose: `oauth_client_secret:${input.issuer}`,
        workspaceId: input.connection.workspaceId,
      })
    : null;
  const now = new Date();
  await db.insert(aiMcpClientRegistration).values({
    clientId: clientInformation.client_id,
    clientSecretAuthTag: encryptedSecret?.authTag,
    clientSecretCiphertext: encryptedSecret?.ciphertext,
    clientSecretIv: encryptedSecret?.iv,
    connectionId: input.connection.id,
    createdAt: now,
    id: crypto.randomUUID(),
    issuer: input.issuer,
    keyVersion: encryptedSecret?.keyVersion,
    updatedAt: now,
    workspaceId: input.connection.workspaceId,
  });
  return clientInformation;
}

export async function loadClientRegistration(
  connection: typeof aiMcpConnection.$inferSelect,
  issuer: string,
  env: RuntimeEnv,
): Promise<OAuthClientInformationMixed> {
  const [registration] = await db
    .select()
    .from(aiMcpClientRegistration)
    .where(
      and(
        eq(aiMcpClientRegistration.connectionId, connection.id),
        eq(aiMcpClientRegistration.issuer, issuer),
      ),
    )
    .limit(1);
  if (!registration)
    throw new McpServiceError(
      "mcp_oauth_client_missing",
      "OAuth client registration is missing.",
      409,
    );
  if (
    registration.clientSecretCiphertext &&
    registration.clientSecretIv &&
    registration.clientSecretAuthTag &&
    registration.keyVersion
  ) {
    const clientSecret = await decryptMcpSecret(
      env,
      {
        authTag: registration.clientSecretAuthTag,
        ciphertext: registration.clientSecretCiphertext,
        iv: registration.clientSecretIv,
        keyVersion: registration.keyVersion,
      },
      {
        authenticatedByUserId: connection.authenticatedByUserId,
        connectionId: connection.id,
        profileId: getMcpCredentialScopeId(connection),
        purpose: `oauth_client_secret:${issuer}`,
        workspaceId: connection.workspaceId,
      },
    );
    return { client_id: registration.clientId, client_secret: clientSecret };
  }
  return { client_id: registration.clientId };
}

async function registerConfiguredClient(
  input: Parameters<typeof resolveClientInformation>[0],
): Promise<OAuthClientInformationMixed> {
  const catalogPrefix = input.connection.catalogId?.toUpperCase();
  const configuredId = catalogPrefix
    ? getStringEnv(input.env, `MCP_${catalogPrefix}_CLIENT_ID`)
    : undefined;
  const metadataUrl = getStringEnv(input.env, "MCP_CLIENT_METADATA_URL");
  let clientInformation: OAuthClientInformationMixed;
  if (configuredId) {
    clientInformation = {
      client_id: configuredId,
      client_secret: getStringEnv(input.env, `MCP_${catalogPrefix}_CLIENT_SECRET`),
    };
  } else if (metadataUrl && input.metadata.client_id_metadata_document_supported === true) {
    clientInformation = { client_id: metadataUrl };
  } else if (input.metadata.registration_endpoint) {
    clientInformation = await registerClient(input.issuer, {
      clientMetadata: input.clientMetadata,
      fetchFn: input.fetchFn,
      metadata: input.metadata,
    });
  } else {
    throw new McpServiceError(
      "mcp_oauth_client_unconfigured",
      "This OAuth server requires a pre-registered client or client metadata URL.",
      409,
    );
  }

  return clientInformation;
}

async function revokeTokens(
  fetchFn: ReturnType<typeof createSecureMcpFetch>,
  revocationEndpoint: string,
  registration: OAuthClientInformationMixed,
  credential: { refreshToken?: string; accessToken?: string },
) {
  for (const [token, hint] of [
    [credential.refreshToken, "refresh_token"],
    [credential.accessToken, "access_token"],
  ] as const) {
    if (!token) continue;
    const body = new URLSearchParams({
      client_id: registration.client_id,
      token,
      token_type_hint: hint,
    });
    if ("client_secret" in registration && registration.client_secret) {
      body.set("client_secret", registration.client_secret);
    }
    await fetchFn(revocationEndpoint, {
      body: body.toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
  }
}
