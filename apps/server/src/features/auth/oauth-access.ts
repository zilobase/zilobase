import { verifyJwsAccessToken } from "better-auth/oauth2";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import type { JWK, JSONWebKeySet, JWTPayload } from "jose";

import { db } from "../../infrastructure/database";
import {
  jwks as jwksTable,
  session as sessionTable,
  user as userTable,
} from "../../infrastructure/database/schema";
import { getMembership } from "../access";
import type { AppBindings } from "../../shared/types";

export function isLikelyJwt(token: string) {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

export function readBearerToken(authorization: string | null | undefined) {
  if (!authorization) {
    return null;
  }

  const [scheme, ...rest] = authorization.trim().split(/\s+/);
  const token = rest[0];

  if (scheme?.toLowerCase() !== "bearer" || rest.length !== 1 || !token) {
    return null;
  }

  return token;
}

export function parseOAuthScopes(scope: unknown) {
  if (typeof scope !== "string" || scope.trim().length === 0) {
    return [];
  }

  return scope.trim().split(/\s+/);
}

export function requireOAuthScope(c: Context<AppBindings>, scope: string) {
  if (c.get("authMethod") !== "oauth") {
    return null;
  }

  const scopes = c.get("oauthScopes") ?? [];

  if (scopes.includes(scope)) {
    return null;
  }

  c.header("WWW-Authenticate", `Bearer error="insufficient_scope", scope="${scope}"`);
  return c.json(
    {
      error: "insufficient_scope",
      error_description: `Missing required scope: ${scope}`,
    },
    403,
  );
}

// Only APIs with explicit OAuth scope and workspace checks accept delegated tokens.
export function rejectUnsupportedOAuthRoute(c: Context<AppBindings>) {
  if (c.get("authMethod") !== "oauth") return null;
  const path = c.req.path.replace(/\/$/, "");
  if (
    /^\/(pages|databases)(\/|$)/.test(path) ||
    path === "/clips" ||
    path === "/clips/duplicates" ||
    path === "/search" ||
    /^\/workspaces(?:\/[^/]+)?$/.test(path)
  )
    return null;
  return c.json(
    { error: "insufficient_scope", error_description: "This API does not accept OAuth tokens." },
    403,
  );
}

export function oauthScopeMiddleware(scopeFor: (c: Context<AppBindings>) => string) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const denied = requireOAuthScope(c, scopeFor(c));
    if (denied) {
      return denied;
    }

    await next();
  });
}

export function scopeForReadWrite(readScope: string, writeScope: string) {
  return (c: Context<AppBindings>) =>
    c.req.method === "GET" || c.req.method === "HEAD" ? readScope : writeScope;
}

export function getPinnedWorkspaceId(c: Context<AppBindings>) {
  if (c.get("authMethod") === "apiKey") {
    return c.get("apiKey")?.workspaceId ?? null;
  }

  if (c.get("authMethod") === "oauth") {
    return c.get("session")?.activeWorkspaceId ?? null;
  }

  return null;
}

export function rejectMismatchedPinnedWorkspace(
  c: Context<AppBindings>,
  workspaceId: string | null | undefined,
) {
  const pinnedWorkspaceId = getPinnedWorkspaceId(c);

  if (!pinnedWorkspaceId || !workspaceId || workspaceId === pinnedWorkspaceId) {
    return null;
  }

  return c.json(
    {
      error: "Forbidden",
      message:
        c.get("authMethod") === "oauth"
          ? "OAuth tokens can only access the workspace they were issued for."
          : "API keys can only access the workspace they were created for.",
    },
    403,
  );
}

export type OAuthAccessSuccess = {
  scopes: string[];
  user: typeof userTable.$inferSelect;
  workspaceId: string;
  sessionId: string | null;
};

export type OAuthAccessFailure = {
  body: { error: string; message?: string };
  status: 401 | 403;
};

export async function resolveOAuthBearer(options: {
  apiOrigin: string;
  requestedWorkspaceId: string | null;
  token: string;
  verify?: typeof verifyJwsAccessToken;
}): Promise<OAuthAccessSuccess | OAuthAccessFailure> {
  const verify = options.verify ?? verifyJwsAccessToken;
  let payload: JWTPayload;

  try {
    payload = await verify(options.token, {
      jwksFetch: loadLocalJwks,
      jwksCacheKey: localJwksCacheKey,
      verifyOptions: {
        audience: options.apiOrigin,
        issuer: options.apiOrigin,
      },
    });
  } catch {
    return { body: { error: "Unauthorized" }, status: 401 };
  }

  const userId = typeof payload.sub === "string" ? payload.sub : null;
  const workspaceId = readStringClaim(payload, "workspace_id");
  const sessionId = readStringClaim(payload, "sid");

  if (!userId || !workspaceId) {
    return {
      body: {
        error: "Forbidden",
        message: "OAuth token is missing a user or workspace claim.",
      },
      status: 403,
    };
  }

  if (options.requestedWorkspaceId && options.requestedWorkspaceId !== workspaceId) {
    return {
      body: {
        error: "Forbidden",
        message: "OAuth tokens can only access the workspace they were issued for.",
      },
      status: 403,
    };
  }

  if (sessionId) {
    const [oauthSession] = await db
      .select({ id: sessionTable.id })
      .from(sessionTable)
      .where(eq(sessionTable.id, sessionId))
      .limit(1);

    if (!oauthSession) {
      return { body: { error: "Unauthorized" }, status: 401 };
    }
  }

  const [user] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1);

  if (!user) {
    return { body: { error: "Unauthorized" }, status: 401 };
  }

  if (!(await getMembership(workspaceId, user.id))) {
    return { body: { error: "Forbidden" }, status: 403 };
  }

  return {
    scopes: parseOAuthScopes(payload.scope),
    sessionId,
    user,
    workspaceId,
  };
}

function readStringClaim(payload: JWTPayload, claim: string) {
  const value = payload[claim];
  return typeof value === "string" && value.length > 0 ? value : null;
}

const localJwksCacheKey = {};

async function loadLocalJwks(): Promise<JSONWebKeySet> {
  const rows = await db
    .select({ id: jwksTable.id, publicKey: jwksTable.publicKey })
    .from(jwksTable);

  return {
    keys: rows.flatMap((row) => {
      try {
        const parsed = JSON.parse(row.publicKey) as JWK;
        return parsed && typeof parsed === "object" ? [{ ...parsed, kid: row.id }] : [];
      } catch {
        return [];
      }
    }),
  };
}
