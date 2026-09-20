import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import { Hono, type Context } from "hono";
import { getAuthHeaders } from "../../shared/security/auth-headers";
import { createAuth, type Auth } from "./auth";
import { db, runWithDbEnv } from "../../infrastructure/database";
import { getPrimaryClientOrigin } from "../../shared/config/config";
import { ensureOfficialClipperClient } from "./oauth-clients";
import {
  getInstanceAdministrationSettings,
  SELF_HOSTED_INVITATION_COOKIE,
  validateSelfHostedInvitationCandidate,
} from "../instance/registration";
import { isCommunityRegistration } from "../../shared/app-policy";
import type { AppBindings } from "../../shared/types";
import { readJsonBody } from "../../shared/http/request";
import { expireTemporaryMemberships } from "../memberships";

export const authRoutes = new Hono<AppBindings>();

function rewriteWorkspaceAuthUrl(request: Request) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/auth/workspace/")) {
    return null;
  }

  url.pathname = url.pathname.replace(
    "/api/auth/workspace/",
    "/api/auth/organization/",
  );

  const workspaceId = url.searchParams.get("workspaceId");

  if (workspaceId && !url.searchParams.has("organizationId")) {
    url.searchParams.set("organizationId", workspaceId);
    url.searchParams.delete("workspaceId");
  }

  return url;
}

async function getWorkspaceAuthRequest(request: Request) {
  const rewrittenUrl = rewriteWorkspaceAuthUrl(request);

  if (!rewrittenUrl) {
    return { request, rewritten: false };
  }

  const headers = new Headers(request.headers);
  let body: BodyInit | null = request.body;

  if (request.method !== "GET" && request.method !== "HEAD") {
    const contentType = headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const jsonBody = await request.clone().json().catch(() => null);

      if (jsonBody && typeof jsonBody === "object" && !Array.isArray(jsonBody)) {
        const nextBody = { ...jsonBody } as Record<string, unknown>;

        if (
          typeof nextBody.workspaceId === "string" &&
          typeof nextBody.organizationId !== "string"
        ) {
          nextBody.organizationId = nextBody.workspaceId;
          delete nextBody.workspaceId;
        }

        body = JSON.stringify(nextBody);
      }
    }
  }

  return {
    request: new Request(rewrittenUrl, {
      body,
      headers,
      method: request.method,
      redirect: request.redirect,
    }),
    rewritten: true,
  };
}

async function toWorkspaceAuthResponse(response: Response, rewritten: boolean) {
  if (!rewritten) {
    return response;
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return response;
  }

  const body = await response.clone().json().catch(() => null);

  if (body === null) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");

  return new Response(JSON.stringify(renameOrganizationFields(body)), {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function renameOrganizationFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(renameOrganizationFields);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const next: Record<string, unknown> = {};

  for (const [key, childValue] of Object.entries(value)) {
    const nextKey =
      key === "organizationId"
        ? "workspaceId"
        : key === "activeOrganizationId"
          ? "activeWorkspaceId"
          : key;

    next[nextKey] = renameOrganizationFields(childValue);
  }

  return next;
}

authRoutes.get("/.well-known/oauth-authorization-server", (c) =>
  serveOAuthMetadata(c, oauthProviderAuthServerMetadata),
);
authRoutes.get("/.well-known/oauth-authorization-server/*", (c) =>
  serveOAuthMetadata(c, oauthProviderAuthServerMetadata),
);
authRoutes.get("/.well-known/openid-configuration", (c) =>
  serveOAuthMetadata(c, oauthProviderOpenIdConfigMetadata),
);
authRoutes.get("/.well-known/openid-configuration/*", (c) =>
  serveOAuthMetadata(c, oauthProviderOpenIdConfigMetadata),
);

authRoutes.post("/api/auth/set-password", async (c) => {
  const body = await readJsonBody(c.req);
  return runWithDbEnv(c.env, async () => {
    const auth = await createAuth(c.env, c.req.raw, undefined, {
      editionExtension: c.get("editionExtension") ?? undefined,
      policy: c.get("appPolicy"),
    });

    return auth.api.setPassword({
      asResponse: true,
      body: body as { newPassword: string },
      headers: await getAuthHeaders(auth, c.req.raw.headers),
    });
  });
});

authRoutes.on(["GET", "POST"], "/api/auth/*", async (c) => {
  if (c.req.path.startsWith("/api/auth/api-key/")) {
    return c.json({ error: "Not found" }, 404);
  }

  const { request, rewritten } = await getWorkspaceAuthRequest(c.req.raw);

  return runWithDbEnv(c.env, async () => {
    if (await isBlockedSelfHostedWorkspaceCreate(
      c.env,
      request,
      isCommunityRegistration(c.get("appPolicy")),
    )) {
      return c.json(
        {
          error: "Self-hosted deployments can only have one workspace.",
        },
        409,
      );
    }

    const invitation = await prepareSocialRegistration(
      c.env,
      request,
      isCommunityRegistration(c.get("appPolicy")),
    );

    if (!invitation.allowed) {
      return c.json(
        { code: invitation.code, error: invitation.message },
        invitation.code === "bootstrap_required" ? 503 : 403,
      );
    }

    const auth = await createAuth(c.env, request, undefined, {
      editionExtension: c.get("editionExtension") ?? undefined,
      policy: c.get("appPolicy"),
    });

    if (new URL(request.url).pathname.startsWith("/api/auth/organization/")) {
      await expireTemporaryMemberships();
    }

    const response = await auth
      .handler(request)
      .then((response) => toWorkspaceAuthResponse(response, rewritten));

    return applySocialInvitationCookie(
      response,
      request,
      invitation.invitationId,
    );
  });
});

async function prepareSocialRegistration(
  env: Record<string, unknown>,
  request: Request,
  communityRegistration: boolean,
) {
  const url = new URL(request.url);

  if (
    !communityRegistration ||
    request.method !== "POST" ||
    url.pathname !== "/api/auth/sign-in/social"
  ) {
    return { allowed: true as const, invitationId: null };
  }

  const body = await request.clone().json().catch(() => null);
  const invitationId =
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    typeof (body as Record<string, unknown>).invitationId === "string"
      ? (body as Record<string, string>).invitationId
      : null;

  if (!invitationId) {
    return { allowed: true as const, invitationId: null };
  }

  return validateSelfHostedInvitationCandidate(env, invitationId);
}

function serveOAuthMetadata(
  c: Context<AppBindings>,
  createHandler: (auth: Auth) => (request: Request) => Promise<Response>,
) {
  return runWithDbEnv(c.env, async () => {
    await ensureOfficialClipperClient(db, getPrimaryClientOrigin(c.env));
    const auth = await createAuth(c.env, c.req.raw, undefined, {
      editionExtension: c.get("editionExtension") ?? undefined,
      policy: c.get("appPolicy"),
    });

    return createHandler(auth)(c.req.raw);
  });
}

function applySocialInvitationCookie(
  response: Response,
  request: Request,
  invitationId: string | null,
) {
  const pathname = new URL(request.url).pathname;
  const isSocialStart = pathname === "/api/auth/sign-in/social";
  const isSocialCallback = pathname.startsWith("/api/auth/callback/");

  if ((!isSocialStart || !invitationId) && !isSocialCallback) {
    return response;
  }

  const attributes = [
    `${SELF_HOSTED_INVITATION_COOKIE}=${
      isSocialCallback ? "" : encodeURIComponent(invitationId ?? "")
    }`,
    "Path=/api/auth",
    "HttpOnly",
    "SameSite=Lax",
    isSocialCallback ? "Max-Age=0" : "Max-Age=1800",
  ];

  if (new URL(request.url).protocol === "https:") {
    attributes.push("Secure");
  }

  const headers = new Headers(response.headers);
  headers.append("set-cookie", attributes.join("; "));

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

async function isBlockedSelfHostedWorkspaceCreate(
  env: Record<string, unknown>,
  request: Request,
  communityRegistration: boolean,
) {
  const url = new URL(request.url);

  return (
    communityRegistration &&
    request.method === "POST" &&
    url.pathname === "/api/auth/organization/create" &&
    Boolean((await getInstanceAdministrationSettings(env)).pinnedWorkspaceId)
  );
}
