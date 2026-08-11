import { asc } from "drizzle-orm";
import { Hono } from "hono";
import { getAuthHeaders } from "../auth-headers";
import { createAuth } from "../auth";
import { db, runWithDbEnv } from "../db";
import { workspace } from "../db/schema";
import { isSelfHostedRuntime } from "../runtime-adapter";
import type { AppBindings } from "../types";

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

authRoutes.post("/api/auth/set-password", async (c) => {
  const body = await c.req.json().catch(() => null);
  return runWithDbEnv(c.env, async () => {
    const auth = createAuth(c.env, c.req.raw);

    return auth.api.setPassword({
      asResponse: true,
      body,
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
    if (await isBlockedSelfHostedWorkspaceCreate(request)) {
      return c.json(
        {
          error: "Self-hosted deployments can only have one workspace.",
        },
        409,
      );
    }

    const auth = createAuth(c.env, request);

    return auth
      .handler(request)
      .then((response) => toWorkspaceAuthResponse(response, rewritten));
  });
});

async function isBlockedSelfHostedWorkspaceCreate(request: Request) {
  const url = new URL(request.url);

  return (
    isSelfHostedRuntime() &&
    request.method === "POST" &&
    url.pathname === "/api/auth/organization/create" &&
    Boolean(await getPinnedWorkspaceId())
  );
}

async function getPinnedWorkspaceId() {
  const [pinnedWorkspace] = await db
    .select({ id: workspace.id })
    .from(workspace)
    .orderBy(asc(workspace.createdAt))
    .limit(1);

  return pinnedWorkspace?.id ?? null;
}
