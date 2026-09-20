import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import {
  readApiKeyFromHeaders,
  readApiKeyWorkspaceId,
} from "../api-keys";
import { getAuthHeaders } from "../../shared/security/auth-headers";
import { createAuth } from "./auth";
import { getMembership } from "../access";
import { runWithDbEnv } from "../../infrastructure/database";
import { db } from "../../infrastructure/database";
import { user as userTable } from "../../infrastructure/database/schema";
import type { AppBindings } from "../../shared/types";
import { expireTemporaryMemberships } from "../memberships";
import { DEMO_IDS } from "../demo/constants";
import { isHostedDemoRequest } from "../demo/request";
import {
  isLikelyJwt,
  readBearerToken,
  resolveOAuthBearer,
  rejectUnsupportedOAuthRoute,
} from "./oauth-access";
import {
  getCanonicalApiOrigin,
  isLocalDevelopmentHost,
  resolvePublicRequestUrl,
} from "../../shared/config/config";

function normalizeAuthSession<TSession extends Record<string, unknown>>(
  session: TSession | null | undefined,
) {
  if (!session) {
    return null;
  }

  const activeWorkspaceId =
    typeof session.activeWorkspaceId === "string"
      ? session.activeWorkspaceId
      : typeof session.activeOrganizationId === "string"
        ? session.activeOrganizationId
        : null;

  return {
    ...session,
    activeWorkspaceId,
  };
}

export const sessionMiddleware = createMiddleware<AppBindings>(async (
  c,
  next,
) => {
  return await timed(c, "session_db", () => runWithDbEnv(c.env, async () => {
    c.set("apiKey", null);
    c.set("authMethod", null);
    c.set("oauthScopes", null);

    if (isHostedDemoRequest(c.env, c.req.raw.headers)) {
      const [demoUser] = await db
        .select()
        .from(userTable)
        .where(eq(userTable.id, DEMO_IDS.user))
        .limit(1);

      if (
        !demoUser ||
        !(await getMembership(DEMO_IDS.workspace, DEMO_IDS.user))
      ) {
        return c.json(
          {
            code: "DEMO_UNAVAILABLE",
            error: "The hosted demo is unavailable.",
          },
          503,
        );
      }

      const now = new Date();
      c.set("user", demoUser);
      c.set("session", {
        activeTeamId: null,
        activeWorkspaceId: DEMO_IDS.workspace,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        id: "demo:synthetic-session",
        ipAddress: null,
        token: "",
        updatedAt: now,
        userAgent: null,
        userId: demoUser.id,
      });
      c.set("authMethod", "demo");
      await timed(c, "session_next", next);
      return;
    }

    const rawApiKey = readApiKeyFromHeaders(c.req.raw.headers);
    if (rawApiKey) {
      const auth = await createAuth(c.env, c.req.raw, db, {
        editionExtension: c.get("editionExtension") ?? undefined,
        policy: c.get("appPolicy"),
      });
      const verification = await timed(c, "session_api_key_verify", () =>
        auth.api.verifyApiKey({
          body: { key: rawApiKey },
        }),
      );

      if (!verification.valid || !verification.key) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const verifiedKey = verification.key;
      const workspaceId = readApiKeyWorkspaceId(verifiedKey.metadata);

      if (!workspaceId) {
        return c.json({ error: "API key is missing workspace metadata" }, 401);
      }

      const requestedWorkspaceId = c.req
        .header("x-zilobase-workspace-id")
        ?.trim();

      if (
        requestedWorkspaceId &&
        requestedWorkspaceId !== workspaceId
      ) {
        return c.json(
          {
            error: "Forbidden",
            message:
              "API keys can only access the workspace they were created for.",
          },
          403,
        );
      }

      const [apiKeyUser] = await timed(c, "session_api_key_user", () =>
        db
          .select()
          .from(userTable)
          .where(eq(userTable.id, verifiedKey.referenceId))
          .limit(1),
      );

      if (!apiKeyUser) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      if (!(await timed(c, "session_api_key_membership", () =>
        getMembership(workspaceId, apiKeyUser.id)
      ))) {
        return c.json({ error: "Forbidden" }, 403);
      }

      c.set("user", apiKeyUser);
      c.set("session", {
        activeWorkspaceId: workspaceId,
        activeTeamId: null,
        createdAt: verifiedKey.createdAt,
        expiresAt:
          verifiedKey.expiresAt ??
          new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 100),
        id: `api-key:${verifiedKey.id}`,
        ipAddress: null,
        token: "",
        updatedAt: verifiedKey.updatedAt,
        userId: apiKeyUser.id,
        userAgent: null,
      });
      c.set("apiKey", {
        id: verifiedKey.id,
        workspaceId,
        referenceId: verifiedKey.referenceId,
      });
      c.set("authMethod", "apiKey");

      await timed(c, "session_next", next);
      return;
    }

    const bearerToken = readBearerToken(c.req.header("authorization"));
    if (bearerToken && isLikelyJwt(bearerToken)) {
      const requestUrl = resolvePublicRequestUrl(c.req.raw, c.env);
      const apiOrigin = isLocalDevelopmentHost(requestUrl.hostname)
        ? requestUrl.origin
        : getCanonicalApiOrigin(c.env);
      const oauthAccess = await timed(c, "session_oauth_verify", () =>
        resolveOAuthBearer({
          apiOrigin,
          requestedWorkspaceId:
            c.req.header("x-zilobase-workspace-id")?.trim() || null,
          token: bearerToken,
        }),
      );

      if ("status" in oauthAccess) {
        return c.json(oauthAccess.body, oauthAccess.status);
      }

      const now = new Date();
      c.set("user", oauthAccess.user);
      c.set("session", {
        activeTeamId: null,
        activeWorkspaceId: oauthAccess.workspaceId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        id: oauthAccess.sessionId ?? `oauth:${oauthAccess.user.id}`,
        ipAddress: null,
        token: "",
        updatedAt: now,
        userAgent: null,
        userId: oauthAccess.user.id,
      });
      c.set("authMethod", "oauth");
      c.set("oauthScopes", oauthAccess.scopes);
      const unsupported = rejectUnsupportedOAuthRoute(c);
      if (unsupported) return unsupported;
      await timed(c, "session_next", next);
      return;
    }

    const auth = await createAuth(c.env, c.req.raw, db, {
      editionExtension: c.get("editionExtension") ?? undefined,
      policy: c.get("appPolicy"),
    });
    const session = await timed(c, "session_auth", async () =>
      auth.api.getSession({
        headers: await getAuthHeaders(auth, c.req.raw.headers),
      }),
    );

    if (session?.user) {
      await timed(c, "session_expire_temporary_memberships", () =>
        expireTemporaryMemberships(db, { userId: session.user.id }),
      );
    }

    c.set("user", session?.user ?? null);
    const normalizedSession = normalizeAuthSession(session?.session);
    const activeMembership =
      session?.user && normalizedSession?.activeWorkspaceId
        ? await getMembership(
            normalizedSession.activeWorkspaceId,
            session.user.id,
          )
        : null;
    c.set(
      "session",
      normalizedSession &&
        normalizedSession.activeWorkspaceId &&
        !activeMembership
        ? { ...normalizedSession, activeTeamId: null, activeWorkspaceId: null }
        : normalizedSession,
    );
    c.set("authMethod", session?.user ? "session" : null);

    const effectiveSession = c.get("session");
    if (session?.user && effectiveSession) {
      const denial = await timed(c, "session_edition_policy", () =>
        c.get("editionExtension")?.assertSession?.({
          authMethod: "session",
          database: db,
          request: c.req.raw,
          session: effectiveSession,
          user: session.user,
        }) ?? Promise.resolve(),
      );

      if (denial) {
        return c.json(
          { code: denial.code, message: denial.message },
          denial.status,
        );
      }
    }

    await timed(c, "session_next", next);
  }, {
    onTiming(name, durationMs) {
      const timings = c.get("serverTimings") ?? [];
      if (!c.get("serverTimings")) c.set("serverTimings", timings);
      timings.push(`zilobase_${name};dur=${durationMs}`);
    },
  }));
});

async function timed<T>(
  c: Parameters<MiddlewareHandler<AppBindings>>[0],
  name: string,
  run: () => Promise<T>,
) {
  const startedAt = performance.now();

  try {
    return await run();
  } finally {
    const timings = c.get("serverTimings") ?? [];
    if (!c.get("serverTimings")) c.set("serverTimings", timings);
    timings.push(
      `zilobase_${name};dur=${Math.round(performance.now() - startedAt)}`,
    );
  }
}
