import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { getMembership, isPrivilegedOrgRole } from "../access";
import { rejectMismatchedApiKeyWorkspace } from "../api-keys";
import { db } from "../infrastructure/database";
import {
  invitation,
  member,
  session as authSession,
  workspace,
  team,
  teamMember,
  teamspace,
  teamspacePrincipal,
  user,
} from "../infrastructure/database/schema";
import type { AppBindings } from "../shared/types";
import {
  activeMembershipCondition,
  expireTemporaryMemberships,
  parseMembershipAccessExpiry,
  TemporaryMembershipValidationError,
} from "../services/temporary-membership";
import { sendEmail } from "../infrastructure/email/email";
import { getPrimaryClientOrigin } from "../shared/config/config";

export const workspaceRoutes = new Hono<AppBindings>();

const requireUser = (c: Context<AppBindings>) => c.get("user") ?? null;
const memberInvitationSchema = z
  .object({
    accessExpiresAt: z.string().datetime({ offset: true }).nullable().optional(),
    email: z.string().trim().email(),
    role: z.enum(["admin", "member", "temporary"]),
  })
  .strict();
const memberUpdateSchema = z
  .object({
    accessExpiresAt: z.string().datetime({ offset: true }).nullable().optional(),
    role: z.enum(["owner", "admin", "member", "temporary"]),
  })
  .strict();
const updateWorkspaceSchema = z
  .object({
    logo: z
      .union([
        z.string().trim().url("Enter a valid logo URL."),
        z.literal(""),
        z.null(),
      ])
      .optional(),
    metadata: z
      .union([z.string().trim().max(5000), z.literal(""), z.null()])
      .optional(),
    name: z.string().trim().min(1, "Workspace name is required.").max(120).optional(),
    slug: z
      .string()
      .trim()
      .min(1, "Slug is required.")
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only.")
      .optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.slug !== undefined ||
      value.logo !== undefined ||
      value.metadata !== undefined,
    "Provide at least one field to update.",
  );

workspaceRoutes.get("/:workspaceId/access-targets", async (c) => {
  const requestUser = requireUser(c);

  if (!requestUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const workspaceId = c.req.param("workspaceId");
  const mismatch = rejectMismatchedApiKeyWorkspace(c, workspaceId);

  if (mismatch) {
    return mismatch;
  }

  if (!(await getMembership(workspaceId, requestUser.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [members, teams] = await Promise.all([
    db
      .select({
        email: user.email,
        id: user.id,
        memberId: member.id,
        name: user.name,
        role: member.role,
        accessExpiresAt: member.accessExpiresAt,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(
        and(
          eq(member.organizationId, workspaceId),
          activeMembershipCondition(),
        ),
      )
      .orderBy(asc(user.name), asc(user.email)),
    db
      .select({
        id: team.id,
        name: team.name,
      })
      .from(team)
      .where(eq(team.organizationId, workspaceId))
      .orderBy(asc(team.name)),
  ]);

  return c.json({ members, teams });
});

workspaceRoutes.post("/:workspaceId/member-invitations", async (c) => {
  const requestUser = requireUser(c);

  if (!requestUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const workspaceId = c.req.param("workspaceId");
  const mismatch = rejectMismatchedApiKeyWorkspace(c, workspaceId);

  if (mismatch) {
    return mismatch;
  }

  const actorMembership = await getMembership(workspaceId, requestUser.id);

  if (!actorMembership || !isPrivilegedOrgRole(actorMembership.role)) {
    return c.json({ error: "Only workspace admins can invite members." }, 403);
  }

  const parsed = memberInvitationSchema.safeParse(
    await c.req.json().catch(() => null),
  );

  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid invitation." },
      400,
    );
  }

  let membershipExpiresAt: Date | null;

  try {
    membershipExpiresAt = parseMembershipAccessExpiry(
      parsed.data.role,
      parsed.data.accessExpiresAt,
    );
  } catch (error) {
    if (error instanceof TemporaryMembershipValidationError) {
      return c.json({ error: error.message }, 400);
    }

    throw error;
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const [existingUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.email}) = ${normalizedEmail}`)
    .limit(1);

  if (existingUser) {
    await expireTemporaryMemberships(db, { userId: existingUser.id });

    if (await getMembership(workspaceId, existingUser.id)) {
      return c.json({ error: "This user is already a workspace member." }, 409);
    }
  }

  const [pendingInvitation] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, workspaceId),
        eq(invitation.status, "pending"),
        sql`lower(${invitation.email}) = ${normalizedEmail}`,
        sql`${invitation.expiresAt} > now()`,
      ),
    )
    .limit(1);

  if (pendingInvitation) {
    return c.json({ error: "This email already has a pending invitation." }, 409);
  }

  const [workspaceRecord] = await db
    .select({ name: workspace.name })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);

  if (!workspaceRecord) {
    return c.json({ error: "Workspace not found." }, 404);
  }

  const invitationExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const [created] = await db
    .insert(invitation)
    .values({
      id: crypto.randomUUID(),
      email: normalizedEmail,
      expiresAt: invitationExpiresAt,
      inviterId: requestUser.id,
      membershipExpiresAt,
      organizationId: workspaceId,
      role: parsed.data.role,
      status: "pending",
    })
    .returning();

  if (!created) {
    return c.json({ error: "Invitation could not be created." }, 500);
  }

  const inviteLink = `${getPrimaryClientOrigin(c.env)}/accept-invitation?id=${created.id}`;
  const temporaryDetails = membershipExpiresAt
    ? `\nTemporary access expires ${membershipExpiresAt.toISOString()}.`
    : "";

  await sendEmail(c.env, {
    to: normalizedEmail,
    subject: `Invitation to join ${workspaceRecord.name} on Zilobase`,
    text: [
      `${requestUser.name} (${requestUser.email}) invited you to ${workspaceRecord.name} as ${parsed.data.role}.`,
      temporaryDetails,
      "",
      `Accept the invitation: ${inviteLink}`,
      `This invitation link expires ${invitationExpiresAt.toISOString()}.`,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return c.json({ invitation: created }, 201);
});

workspaceRoutes.patch("/:workspaceId/members/:memberId", async (c) => {
  const requestUser = requireUser(c);

  if (!requestUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const workspaceId = c.req.param("workspaceId");
  const actorMembership = await getMembership(workspaceId, requestUser.id);

  if (!actorMembership || !isPrivilegedOrgRole(actorMembership.role)) {
    return c.json({ error: "Only workspace admins can manage members." }, 403);
  }

  const parsed = memberUpdateSchema.safeParse(
    await c.req.json().catch(() => null),
  );

  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid member update." },
      400,
    );
  }

  let accessExpiresAt: Date | null;

  try {
    accessExpiresAt = parseMembershipAccessExpiry(
      parsed.data.role,
      parsed.data.accessExpiresAt,
    );
  } catch (error) {
    if (error instanceof TemporaryMembershipValidationError) {
      return c.json({ error: error.message }, 400);
    }

    throw error;
  }

  const result = await db.transaction(async (transaction) => {
    const [target] = await transaction
      .select()
      .from(member)
      .where(
        and(
          eq(member.id, c.req.param("memberId")),
          eq(member.organizationId, workspaceId),
        ),
      )
      .for("update")
      .limit(1);

    if (!target) {
      return { error: "Member not found.", status: 404 as const };
    }

    const changesOwnerRole =
      target.role === "owner" || parsed.data.role === "owner";

    if (changesOwnerRole && actorMembership.role !== "owner") {
      return {
        error: "Only workspace owners can change the owner role.",
        status: 403 as const,
      };
    }

    if (target.role === "owner" && parsed.data.role !== "owner") {
      const [{ count: ownerCount }] = await transaction
        .select({ count: sql<number>`count(*)::integer` })
        .from(member)
        .where(
          and(
            eq(member.organizationId, workspaceId),
            eq(member.role, "owner"),
          ),
        );

      if ((ownerCount ?? 0) <= 1) {
        return {
          error: "The workspace must keep at least one owner.",
          status: 409 as const,
        };
      }
    }

    const [updated] = await transaction
      .update(member)
      .set({ accessExpiresAt, role: parsed.data.role })
      .where(eq(member.id, target.id))
      .returning();

    return { member: updated! };
  });

  if ("error" in result) {
    return c.json({ error: result.error }, result.status);
  }

  await c.get("editionExtension")?.recordSecurityEvent({
    actorUserId: requestUser.id,
    database: db,
    details: {
      accessExpiresAt: result.member.accessExpiresAt?.toISOString() ?? null,
      role: result.member.role,
    },
    occurredAt: new Date(),
    type: "membership.updated",
    userId: result.member.userId,
    workspaceId,
  });

  return c.json({ member: result.member });
});

workspaceRoutes.delete("/:workspaceId/members/:memberId", async (c) => {
  const requestUser = requireUser(c);

  if (!requestUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const workspaceId = c.req.param("workspaceId");
  const actorMembership = await getMembership(workspaceId, requestUser.id);

  if (!actorMembership || !isPrivilegedOrgRole(actorMembership.role)) {
    return c.json({ error: "Only workspace admins can remove members." }, 403);
  }

  const result = await db.transaction(async (transaction) => {
    const [target] = await transaction
      .select()
      .from(member)
      .where(
        and(
          eq(member.id, c.req.param("memberId")),
          eq(member.organizationId, workspaceId),
        ),
      )
      .for("update")
      .limit(1);

    if (!target) {
      return { error: "Member not found.", status: 404 as const };
    }

    if (target.role === "owner") {
      const [{ count: ownerCount }] = await transaction
        .select({ count: sql<number>`count(*)::integer` })
        .from(member)
        .where(
          and(
            eq(member.organizationId, workspaceId),
            eq(member.role, "owner"),
          ),
        );

      if ((ownerCount ?? 0) <= 1) {
        return {
          error: "The workspace must keep at least one owner.",
          status: 409 as const,
        };
      }
    }

    const workspaceTeamIds = transaction
      .select({ id: team.id })
      .from(team)
      .where(eq(team.organizationId, workspaceId));
    const workspaceTeamspaceIds = transaction
      .select({ id: teamspace.id })
      .from(teamspace)
      .where(eq(teamspace.workspaceId, workspaceId));

    await transaction
      .delete(teamMember)
      .where(
        and(
          eq(teamMember.userId, target.userId),
          inArray(teamMember.teamId, workspaceTeamIds),
        ),
      );
    await transaction
      .delete(teamspacePrincipal)
      .where(
        and(
          eq(teamspacePrincipal.principalType, "user"),
          eq(teamspacePrincipal.principalId, target.userId),
          inArray(teamspacePrincipal.teamspaceId, workspaceTeamspaceIds),
        ),
      );
    await transaction
      .update(authSession)
      .set({ activeTeamId: null, activeWorkspaceId: null })
      .where(
        and(
          eq(authSession.userId, target.userId),
          eq(authSession.activeWorkspaceId, workspaceId),
        ),
      );
    await transaction.delete(member).where(eq(member.id, target.id));

    return { member: target };
  });

  if ("error" in result) {
    return c.json({ error: result.error }, result.status);
  }

  await c.get("editionExtension")?.recordSecurityEvent({
    actorUserId: requestUser.id,
    database: db,
    details: { role: result.member.role },
    occurredAt: new Date(),
    type: "membership.removed",
    userId: result.member.userId,
    workspaceId,
  });

  return c.json({ removed: true });
});

workspaceRoutes.patch("/:workspaceId", async (c) => {
  const requestUser = requireUser(c);

  if (!requestUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const workspaceId = c.req.param("workspaceId");
  const mismatch = rejectMismatchedApiKeyWorkspace(c, workspaceId);

  if (mismatch) {
    return mismatch;
  }

  const membership = await getMembership(workspaceId, requestUser.id);

  if (!membership) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (!isPrivilegedOrgRole(membership.role)) {
    return c.json({ error: "Only workspace admins can update settings." }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = updateWorkspaceSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, 400);
  }

  const nextSlug = parsed.data.slug?.trim().toLowerCase();

  if (nextSlug) {
    const [existingWorkspace] = await db
      .select({ id: workspace.id })
      .from(workspace)
      .where(eq(workspace.slug, nextSlug))
      .limit(1);

    if (existingWorkspace && existingWorkspace.id !== workspaceId) {
      return c.json({ error: "That workspace slug is already in use." }, 409);
    }
  }

  const [updatedWorkspace] = await db
    .update(workspace)
    .set({
      logo:
        parsed.data.logo !== undefined
          ? parsed.data.logo?.trim() || null
          : undefined,
      metadata:
        parsed.data.metadata !== undefined
          ? parsed.data.metadata?.trim() || null
          : undefined,
      name: parsed.data.name?.trim(),
      slug: nextSlug,
      updatedAt: new Date(),
    })
    .where(eq(workspace.id, workspaceId))
    .returning();

  if (!updatedWorkspace) {
    return c.json({ error: "Workspace not found." }, 404);
  }

  return c.json(updatedWorkspace);
});
