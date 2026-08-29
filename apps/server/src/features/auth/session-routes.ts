import { Hono } from "hono";
import type { Context } from "hono";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../../infrastructure/database";
import { account, member, session as authSession } from "../../infrastructure/database/schema";
import {
  getInstanceAdministrationSettings,
  shouldCreateOpenRegistrationMembership,
} from "../instance/registration";
import { isSelfHostedRuntime } from "../../infrastructure/runtime/runtime-adapter";
import type { AppBindings } from "../../shared/types";
import { MembershipService } from "../memberships";
import { activeMembershipCondition } from "../memberships";

export const sessionRoutes = new Hono<AppBindings>();

sessionRoutes.get("/", (c) => timed(c, "route_session_total", async () => {
  const user = c.get("user");
  const session = c.get("session");

  if (!user) {
    return c.json({ user: null, session: null }, 401);
  }

  const [selfHostedWorkspaceId, hasPassword] = await Promise.all([
    timed(c, "route_session_pin", () =>
      ensurePinnedWorkspaceMembership(
        c.env,
        user.id,
        user.emailVerified,
        session?.id,
        c.get("editionExtension") ?? undefined,
      ),
    ),
    timed(
      c,
      "route_session_has_password",
      () => getUserHasPassword(user.id),
    ),
  ]);
  const responseSession =
    session &&
    selfHostedWorkspaceId &&
    session.activeWorkspaceId !== selfHostedWorkspaceId
      ? { ...session, activeWorkspaceId: selfHostedWorkspaceId }
      : session;

  return c.json({
    session: responseSession,
    workspacePinned: isSelfHostedRuntime(),
    user: {
      ...user,
      hasPassword,
    },
  });
}));

async function ensurePinnedWorkspaceMembership(
  env: Record<string, unknown>,
  userId: string,
  emailVerified: boolean,
  sessionId?: string | null,
  editionExtension?: AppBindings["Variables"]["editionExtension"],
) {
  if (!isSelfHostedRuntime()) {
    return null;
  }

  const settings = await getInstanceAdministrationSettings(env);
  const workspaceId = settings.pinnedWorkspaceId;

  if (!workspaceId) {
    return null;
  }

  const [existingMembership] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, workspaceId),
        eq(member.userId, userId),
        activeMembershipCondition(),
      ),
    )
    .limit(1);

  if (!existingMembership) {
    if (
      !shouldCreateOpenRegistrationMembership({
        emailVerified,
        registrationMode: settings.registrationMode,
      })
    ) {
      return null;
    }

    await new MembershipService(
      db,
      editionExtension ?? undefined,
    ).grantMembership({
      role: "member",
      source: "open-registration",
      userId,
      workspaceId,
    });
  }

  if (sessionId) {
    await db
      .update(authSession)
      .set({ activeWorkspaceId: workspaceId, updatedAt: new Date() })
      .where(eq(authSession.id, sessionId));
  }

  return workspaceId;
}

async function getUserHasPassword(userId: string) {
  const [credentialAccount] = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, "credential"),
        isNotNull(account.password),
      ),
    )
    .limit(1);

  return Boolean(credentialAccount);
}

async function timed<T>(
  c: Context<AppBindings>,
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
