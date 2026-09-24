import { oauthProvider } from "@better-auth/oauth-provider";
import { APIError } from "better-auth/api";

import { getPrimaryClientOrigin } from "../../shared/config/config";

export const OAUTH_SCOPES = [
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
] as const;

export const OAUTH_API_RESOURCE_SCOPES = [
  "workspaces.read",
  "pages.read",
  "pages.write",
  "clips.write",
  "databases.read",
  "databases.write",
  "search.read",
] as const;

export const OAUTH_ACCESS_TOKEN_TTL_SECONDS = 1800;
export const OAUTH_REFRESH_TOKEN_REUSE_INTERVAL_SECONDS = 30;

export function createOAuthProviderPlugin(env: Record<string, unknown>, apiOrigin: string) {
  const webOrigin = getPrimaryClientOrigin(env);

  return oauthProvider({
    loginPage: `${webOrigin}/login`,
    consentPage: `${webOrigin}/oauth/consent`,
    scopes: [...OAUTH_SCOPES],
    allowDynamicClientRegistration: false,
    allowPublicClientPrelogin: true,
    cachedTrustedClients: new Set(["zilobase-web-clipper"]),
    accessTokenExpiresIn: OAUTH_ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenReuseInterval: OAUTH_REFRESH_TOKEN_REUSE_INTERVAL_SECONDS,
    enforcePerClientResources: false,
    resources: [
      {
        identifier: apiOrigin,
        name: "Zilobase API",
        accessTokenTtl: OAUTH_ACCESS_TOKEN_TTL_SECONDS,
        allowedScopes: [...OAUTH_API_RESOURCE_SCOPES],
      },
    ],
    postLogin: {
      page: `${webOrigin}/oauth/consent`,
      shouldRedirect: () => false,
      consentReferenceId: ({ session }) => {
        const workspaceId = session.activeOrganizationId ?? session.activeWorkspaceId;
        return typeof workspaceId === "string" && workspaceId.length > 0 ? workspaceId : undefined;
      },
    },
    extensions: [
      {
        claims: {
          async accessToken({ ctx, client, user, referenceId, scopes, resources }) {
            const consent =
              user?.id && referenceId
                ? await ctx.context.adapter.findOne<{ scopes: string[]; resources?: string[] }>({
                    model: "oauthConsent",
                    where: [
                      { field: "clientId", value: client.clientId },
                      { field: "userId", value: user.id },
                      { field: "referenceId", value: referenceId },
                    ],
                  })
                : null;
            if (
              !consent ||
              !scopes.every((scope) => consent.scopes.includes(scope)) ||
              !(resources ?? []).every((resource) => consent.resources?.includes(resource))
            ) {
              throw new APIError("FORBIDDEN", {
                error: "invalid_grant",
                error_description: "Workspace consent is missing or has been revoked.",
              });
            }
            return {};
          },
        },
      },
    ],
    customAccessTokenClaims: async ({ referenceId, user }) => {
      if (!user?.id || !referenceId) {
        throw new APIError("FORBIDDEN", {
          error: "access_denied",
          error_description: "Authorize access to a workspace before requesting tokens.",
        });
      }

      return {
        auth_method: "oauth",
        workspace_id: referenceId,
      };
    },
  });
}
