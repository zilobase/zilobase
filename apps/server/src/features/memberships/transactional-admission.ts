import { and, asc, eq, gt, isNull, notInArray, or, sql } from "drizzle-orm";

import type { Database } from "../../infrastructure/database";
import { invitation, member, session, user } from "../../infrastructure/database/schema";
import type { ZilobaseEditionExtension } from "../../shared/types";
import { ensureDefaultTeamspaceMembership } from "../teamspaces";
import { activeMembershipCondition, parseMembershipAccessExpiry } from "./temporary-membership";

export type TransactionalAdmissionCode =
  | "INVITATION_CONFLICT"
  | "INVITATION_REQUIRED";

export class TransactionalAdmissionError extends Error {
  constructor(readonly code: TransactionalAdmissionCode, message: string) {
    super(message);
    this.name = "TransactionalAdmissionError";
  }
}

export type TransactionalAdmissionResult = {
  membership: typeof member.$inferSelect;
  source: "existing" | "extension" | "invitation";
  invitationId: string | null;
};

export type ReadinessMember = {
  displayName: string;
  email: string;
  emailVerified: boolean;
  role: string;
  userId: string;
};

/** Serialize policy changes and federated admission within one workspace. */
export async function lockWorkspaceAdmission(
  database: Database,
  workspaceId: string,
) {
  await database.execute(sql`
    select pg_advisory_xact_lock(hashtextextended(${`admission:${workspaceId}`}, 0))
  `);
}

export async function findActiveMembershipForAdmission(
  database: Database,
  input: { now?: Date; userId: string; workspaceId: string },
) {
  const [record] = await database.select().from(member).where(and(
    eq(member.organizationId, input.workspaceId),
    eq(member.userId, input.userId),
    or(isNull(member.accessExpiresAt), gt(member.accessExpiresAt, input.now ?? new Date())),
  )).limit(1);
  return record ?? null;
}

/**
 * Admit an extension-authenticated account using an existing membership,
 * exactly one invitation, or workspace policy. The caller must pass the
 * transaction that owns user and session creation.
 */
export async function admitTransactionalMembership(
  database: Database,
  editionExtension: ZilobaseEditionExtension | undefined,
  input: {
    allowWithoutInvitation: boolean;
    email: string;
    now?: Date;
    userId: string;
    workspaceId: string;
  },
): Promise<TransactionalAdmissionResult> {
  const now = input.now ?? new Date();
  const email = input.email.trim().toLowerCase();
  await lockWorkspaceAdmission(database, input.workspaceId);

  const existing = await findActiveMembershipForAdmission(database, { ...input, now });
  if (existing) return { invitationId: null, membership: existing, source: "existing" };

  const invitations = await database.select().from(invitation).where(and(
    eq(invitation.organizationId, input.workspaceId),
    sql`lower(${invitation.email}) = ${email}`,
    eq(invitation.status, "pending"),
    or(isNull(invitation.expiresAt), gt(invitation.expiresAt, now)),
  )).orderBy(asc(invitation.createdAt), asc(invitation.id)).limit(2).for("update");

  if (invitations.length > 1) {
    throw new TransactionalAdmissionError(
      "INVITATION_CONFLICT",
      "More than one active invitation matches this account.",
    );
  }
  const matchedInvitation = invitations[0];
  if (!matchedInvitation && !input.allowWithoutInvitation) {
    throw new TransactionalAdmissionError(
      "INVITATION_REQUIRED",
      "A workspace invitation is required for this account.",
    );
  }

  const role = matchedInvitation?.role ?? "member";
  const accessExpiresAt = parseMembershipAccessExpiry(
    role as "owner" | "admin" | "member" | "temporary",
    matchedInvitation?.membershipExpiresAt,
    now,
  );
  await editionExtension?.beforeMembershipGrant({
    database,
    role,
    source: matchedInvitation ? "invitation" : "extension",
    userId: input.userId,
    workspaceId: input.workspaceId,
  });

  if (matchedInvitation) {
    const [consumed] = await database.update(invitation).set({ status: "accepted" })
      .where(and(eq(invitation.id, matchedInvitation.id), eq(invitation.status, "pending")))
      .returning({ id: invitation.id });
    if (!consumed) {
      throw new TransactionalAdmissionError(
        "INVITATION_CONFLICT",
        "The matching invitation was consumed concurrently.",
      );
    }
  }

  const [created] = await database.insert(member).values({
    accessExpiresAt,
    id: crypto.randomUUID(),
    organizationId: input.workspaceId,
    role,
    userId: input.userId,
  }).returning();
  await ensureDefaultTeamspaceMembership(database, editionExtension, {
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  await editionExtension?.recordSecurityEvent({
    database,
    details: {
      role,
      source: matchedInvitation ? "invitation" : "extension",
    },
    occurredAt: now,
    type: "membership.granted",
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  return {
    invitationId: matchedInvitation?.id ?? null,
    membership: created!,
    source: matchedInvitation ? "invitation" : "extension",
  };
}

export function listWorkspaceReadinessMembers(
  database: Database,
  workspaceId: string,
): Promise<ReadinessMember[]> {
  return database.select({
    displayName: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    role: member.role,
    userId: user.id,
  }).from(member).innerJoin(user, eq(user.id, member.userId)).where(and(
    eq(member.organizationId, workspaceId),
    activeMembershipCondition(),
  )).orderBy(asc(user.id));
}

export async function revokeWorkspaceSessions(
  database: Database,
  input: { exceptSessionIds?: readonly string[]; workspaceId: string },
) {
  const condition = input.exceptSessionIds?.length
    ? and(
        eq(session.activeWorkspaceId, input.workspaceId),
        notInArray(session.id, [...input.exceptSessionIds]),
      )
    : eq(session.activeWorkspaceId, input.workspaceId);
  const revoked = await database.delete(session).where(condition).returning({ id: session.id });
  return revoked.map((record) => record.id);
}
