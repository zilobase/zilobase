import type { OAuthClaimExtensionInput } from "@better-auth/oauth-provider";
import { describe, expect, test, vi } from "vitest";

import { OAUTH_API_RESOURCE_SCOPES, OAUTH_SCOPES, createOAuthProviderPlugin } from "./oauth";

const authEnv = {
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "https://api.example.com",
  CLIENT_URL: "https://app.example.com",
};

describe("oauth provider configuration", () => {
  test("advertises product scopes and the API resource", () => {
    expect(OAUTH_SCOPES).toEqual([
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
    ]);
    expect(OAUTH_API_RESOURCE_SCOPES).not.toContain("openid");
    expect(OAUTH_API_RESOURCE_SCOPES).toContain("clips.write");

    const plugin = createOAuthProviderPlugin(authEnv, "https://api.example.com");

    expect(plugin.options.loginPage).toBe("https://app.example.com/login");
    expect(plugin.options.consentPage).toBe("https://app.example.com/oauth/consent");
    expect(plugin.options.allowDynamicClientRegistration).toBe(false);
    expect(plugin.options.resources).toEqual([
      expect.objectContaining({
        identifier: "https://api.example.com",
        allowedScopes: [...OAUTH_API_RESOURCE_SCOPES],
      }),
    ]);
    expect(plugin.endpoints.getOAuthServerConfig).toBeDefined();
    expect(plugin.endpoints.getOpenIdConfig).toBeDefined();
  });
});

test("workspace claims retain consent binding after switching workspaces", async () => {
  const { options } = createOAuthProviderPlugin(authEnv, "https://api.example.com");
  const user = {
    id: "user-1",
    name: "User",
    email: "user@example.com",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const session = {
    id: "session-1",
    userId: user.id,
    token: "session",
    expiresAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    activeOrganizationId: "workspace-a",
  };
  const referenceId = await options.postLogin!.consentReferenceId({
    user,
    session,
    scopes: ["pages.read"],
  });
  expect(referenceId).toBe("workspace-a");

  session.activeOrganizationId = "workspace-b";
  const claims = await options.customAccessTokenClaims!({
    user,
    scopes: ["pages.read"],
    referenceId,
    metadata: { workspace_id: "attacker-controlled-workspace" },
  });
  expect(claims).toEqual({ auth_method: "oauth", workspace_id: "workspace-a" });
  await expect(
    options.customAccessTokenClaims!({
      user,
      scopes: ["pages.read"],
      metadata: { workspace_id: "workspace-b" },
    }),
  ).rejects.toThrow();
});

test("revoked consent prevents refresh issuance and reduced scopes cannot be regained", async () => {
  const { options } = createOAuthProviderPlugin(authEnv, "https://api.example.com");
  const checkConsent = options.extensions![0].claims!.accessToken!;
  const findOne = vi.fn().mockResolvedValue({
    scopes: ["pages.read"],
    resources: ["https://api.example.com"],
  });
  const input = {
    ctx: { context: { adapter: { findOne } } },
    client: { clientId: "client-1" },
    user: { id: "user-1" },
    referenceId: "workspace-a",
    scopes: ["pages.read"],
    resources: ["https://api.example.com"],
    grantType: "refresh_token",
  } as unknown as OAuthClaimExtensionInput;
  await expect(checkConsent(input)).resolves.toEqual({});
  expect(findOne).toHaveBeenCalledWith({
    model: "oauthConsent",
    where: [
      { field: "clientId", value: "client-1" },
      { field: "userId", value: "user-1" },
      { field: "referenceId", value: "workspace-a" },
    ],
  });
  await expect(checkConsent({ ...input, scopes: ["pages.write"] })).rejects.toThrow();
  await expect(
    checkConsent({ ...input, resources: ["https://other.example.com"] }),
  ).rejects.toThrow();
  findOne.mockResolvedValue(null);
  await expect(checkConsent(input)).rejects.toThrow();
});
