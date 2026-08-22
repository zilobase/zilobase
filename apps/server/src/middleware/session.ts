import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import {
  readApiKeyFromHeaders,
  readApiKeyWorkspaceId,
} from "../api-keys";
import { getAuthHeaders } from "../auth-headers";
import { createAuth } from "../auth";
import { getMembership } from "../access";
import { runWithDbEnv } from "../db";
import { db } from "../db";
import { user as userTable } from "../db/schema";
import type { AppBindings } from "../types";
import { expireTemporaryMemberships } from "../services/temporary-membership";

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

export const sessionMiddleware: MiddlewareHandler<AppBindings> = async (
  c,
  next,
) => {
  return await timed(c, "session_db", () => runWithDbEnv(c.env, async () => {
    c.set("apiKey", null);
    c.set("authMethod", null);

    const rawApiKey = readApiKeyFromHeaders(c.req.raw.headers);
    const auth = createAuth(c.env, c.req.raw, db, {
      editionExtension: c.get("editionExtension") ?? undefined,
    });

    if (rawApiKey) {
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

    await timed(c, "session_next", next);
  }, {
    onTiming(name, durationMs) {
      c.get("serverTimings").push(`zilobase_${name};dur=${durationMs}`);
    },
  }));
};

async function timed<T>(
  c: Parameters<MiddlewareHandler<AppBindings>>[0],
  name: string,
  run: () => Promise<T>,
) {
  const startedAt = performance.now();

  try {
    return await run();
  } finally {
    c.get("serverTimings").push(
      `zilobase_${name};dur=${Math.round(performance.now() - startedAt)}`,
    );
  }
}
