import { and, asc, eq } from "drizzle-orm";

import { normalizeAccessLevel } from "../access";
import { db } from "../db";
import { databaseAccess, member, team } from "../db/schema";
import { activeMembershipCondition } from "./temporary-membership";
import { requireDatabaseAccess } from "./database-access";
import { ServiceMutationError } from "./mutation-error";
import { getDatabaseTeamspaceSecurityPolicy } from "../features/teamspaces/security";

export async function listDatabaseAccessRulesService(input: {
  databaseId: string;
  userId: string;
}) {
  const existing = await requireDatabaseAccess(
    input.databaseId,
    input.userId,
    "full",
  );
  const access = await db
    .select()
    .from(databaseAccess)
    .where(eq(databaseAccess.databaseId, existing.id))
    .orderBy(asc(databaseAccess.createdAt));

  return { access };
}

export async function upsertDatabaseAccessRuleService(input: {
  body: unknown;
  databaseId: string;
  userId: string;
}) {
  const existing = await requireDatabaseAccess(
    input.databaseId,
    input.userId,
    "full",
  );

  if (!input.body || typeof input.body !== "object") {
    throw new ServiceMutationError("A JSON body is required", 400);
  }

  const { targetType, targetId, accessLevel } = input.body as {
    accessLevel?: unknown;
    targetId?: unknown;
    targetType?: unknown;
  };
  const normalizedAccessLevel = normalizeAccessLevel(accessLevel);

  if (
    targetType !== "public" &&
    targetType !== "user" &&
    targetType !== "team"
  ) {
    throw new ServiceMutationError(
      "targetType must be public, user, or team",
      400,
    );
  }

  if (typeof targetId !== "string" || !targetId) {
    throw new ServiceMutationError("targetId is required", 400);
  }

  if (!normalizedAccessLevel || normalizedAccessLevel === "comment") {
    throw new ServiceMutationError(
      "accessLevel must be view, edit, or full",
      400,
    );
  }

  if (
    targetType === "public" &&
    (targetId !== "*" || normalizedAccessLevel !== "view")
  ) {
    throw new ServiceMutationError("public access must be view for *", 400);
  }

  if (targetType === "public") {
    const teamspacePolicy = await getDatabaseTeamspaceSecurityPolicy(existing.id);
    if (teamspacePolicy && !teamspacePolicy.publicSharingEnabled) {
      throw new ServiceMutationError(
        "Public sharing is disabled for this teamspace.",
        403,
      );
    }
  }

  const [target] =
    targetType === "public"
      ? [{ id: "*" }]
      : targetType === "user"
        ? await db
            .select({ id: member.id })
            .from(member)
            .where(
              and(
                eq(member.organizationId, existing.workspaceId),
                eq(member.userId, targetId),
                activeMembershipCondition(),
              ),
            )
            .limit(1)
        : await db
            .select({ id: team.id })
            .from(team)
            .where(
              and(
                eq(team.organizationId, existing.workspaceId),
                eq(team.id, targetId),
              ),
            )
            .limit(1);

  if (!target) {
    throw new ServiceMutationError("Target not found", 404);
  }

  const [rule] = await db
    .insert(databaseAccess)
    .values({
      id: crypto.randomUUID(),
      accessLevel: normalizedAccessLevel,
      workspaceId: existing.workspaceId,
      targetId,
      targetType,
      databaseId: existing.id,
    })
    .onConflictDoUpdate({
      target: [
        databaseAccess.databaseId,
        databaseAccess.targetType,
        databaseAccess.targetId,
      ],
      set: { accessLevel: normalizedAccessLevel, updatedAt: new Date() },
    })
    .returning();

  return { access: rule };
}

export async function deletePublicDatabaseAccessService(input: {
  databaseId: string;
  userId: string;
}) {
  const existing = await requireDatabaseAccess(
    input.databaseId,
    input.userId,
    "full",
  );

  await db
    .delete(databaseAccess)
    .where(
      and(
        eq(databaseAccess.databaseId, existing.id),
        eq(databaseAccess.targetType, "public"),
        eq(databaseAccess.targetId, "*"),
      ),
    );

  return { access: null };
}

export async function deleteDatabaseAccessRuleService(input: {
  databaseId: string;
  ruleId: string;
  userId: string;
}) {
  const existing = await requireDatabaseAccess(
    input.databaseId,
    input.userId,
    "full",
  );

  await db
    .delete(databaseAccess)
    .where(
      and(
        eq(databaseAccess.id, input.ruleId),
        eq(databaseAccess.databaseId, existing.id),
      ),
    );

  return { access: null };
}
