import { and, asc, eq, gt, isNull, lte, sql } from "drizzle-orm";

import {
  getEffectivePageAccessInWorkspace,
  getMembership,
  hasAccess,
  normalizeAccessLevel,
  type AccessLevel,
} from "../access";
import { db } from "../db";
import {
  member,
  page,
  pageAccess,
  pageGuestInvitation,
  user,
  workspace,
  workspaceGuest,
} from "../db/schema";
import { activeMembershipCondition } from "./temporary-membership";

const PAGE_GUEST_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class PageGuestServiceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409,
  ) {
    super(message);
    this.name = "PageGuestServiceError";
  }
}

export function normalizeGuestEmail(value: string) {
  return value.trim().toLowerCase();
}

export function parseGuestAccessLevel(value: unknown): Exclude<AccessLevel, "none"> {
  const accessLevel = normalizeAccessLevel(value);

  if (!accessLevel || accessLevel === "none") {
    throw new PageGuestServiceError(
      "Guest access must be view, edit, or full.",
      400,
    );
  }

  return accessLevel;
}

export function canAcceptPageGuestInvitation(
  invitation: { email: string; expiresAt: Date; status: string },
  userEmail: string,
  now = new Date(),
) {
  return (
    invitation.status === "pending" &&
    invitation.expiresAt.getTime() > now.getTime() &&
    normalizeGuestEmail(invitation.email) === normalizeGuestEmail(userEmail)
  );
}

export async function createPageGuestInvitation(input: {
  accessLevel: unknown;
  email: string;
  inviterId: string;
  pageId: string;
  now?: Date;
}) {
  const [pageRecord] = await db
    .select({
      id: page.id,
      name: page.name,
      workspaceId: page.workspaceId,
    })
    .from(page)
    .where(and(eq(page.id, input.pageId), isNull(page.deletedAt)))
    .limit(1);

  if (!pageRecord) {
    throw new PageGuestServiceError("Page not found.", 404);
  }

  const inviterAccess = await getEffectivePageAccessInWorkspace(
    pageRecord.id,
    pageRecord.workspaceId,
    input.inviterId,
  );

  if (!hasAccess(inviterAccess, "full")) {
    throw new PageGuestServiceError(
      "Full page access is required to invite guests.",
      403,
    );
  }

  const email = normalizeGuestEmail(input.email);
  const accessLevel = parseGuestAccessLevel(input.accessLevel);
  const [existingUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.email}) = ${email}`)
    .limit(1);

  if (
    existingUser &&
    (await getMembership(pageRecord.workspaceId, existingUser.id))
  ) {
    throw new PageGuestServiceError(
      "This person is already a workspace member. Share the page with them directly.",
      409,
    );
  }

  const now = input.now ?? new Date();
  await db
    .update(pageGuestInvitation)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        eq(pageGuestInvitation.pageId, pageRecord.id),
        eq(pageGuestInvitation.status, "pending"),
        sql`lower(${pageGuestInvitation.email}) = ${email}`,
        lte(pageGuestInvitation.expiresAt, now),
      ),
    );
  const [pending] = await db
    .select({ id: pageGuestInvitation.id })
    .from(pageGuestInvitation)
    .where(
      and(
        eq(pageGuestInvitation.pageId, pageRecord.id),
        eq(pageGuestInvitation.status, "pending"),
        sql`lower(${pageGuestInvitation.email}) = ${email}`,
        gt(pageGuestInvitation.expiresAt, now),
      ),
    )
    .limit(1);

  if (pending) {
    throw new PageGuestServiceError(
      "This email already has a pending invitation for the page.",
      409,
    );
  }

  const [workspaceRecord] = await db
    .select({ name: workspace.name })
    .from(workspace)
    .where(eq(workspace.id, pageRecord.workspaceId))
    .limit(1);

  if (!workspaceRecord) {
    throw new PageGuestServiceError("Workspace not found.", 404);
  }

  const [invitation] = await db
    .insert(pageGuestInvitation)
    .values({
      accessLevel,
      email,
      expiresAt: new Date(now.getTime() + PAGE_GUEST_INVITATION_TTL_MS),
      id: crypto.randomUUID(),
      inviterId: input.inviterId,
      pageId: pageRecord.id,
      status: "pending",
      workspaceId: pageRecord.workspaceId,
    })
    .returning();

  if (!invitation) {
    throw new Error("Page guest invitation could not be created.");
  }

  return {
    invitation,
    page: pageRecord,
    workspace: workspaceRecord,
  };
}

export async function getPageGuestInvitation(invitationId: string) {
  const [record] = await db
    .select({
      accessLevel: pageGuestInvitation.accessLevel,
      email: pageGuestInvitation.email,
      expiresAt: pageGuestInvitation.expiresAt,
      id: pageGuestInvitation.id,
      pageId: pageGuestInvitation.pageId,
      pageName: page.name,
      status: pageGuestInvitation.status,
      workspaceId: pageGuestInvitation.workspaceId,
      workspaceName: workspace.name,
    })
    .from(pageGuestInvitation)
    .innerJoin(page, eq(page.id, pageGuestInvitation.pageId))
    .innerJoin(workspace, eq(workspace.id, pageGuestInvitation.workspaceId))
    .where(
      and(
        eq(pageGuestInvitation.id, invitationId),
        isNull(page.deletedAt),
      ),
    )
    .limit(1);

  return record ?? null;
}

export async function acceptPageGuestInvitation(input: {
  invitationId: string;
  userEmail: string;
  userId: string;
  now?: Date;
}) {
  const invitation = await getPageGuestInvitation(input.invitationId);
  const now = input.now ?? new Date();

  if (!invitation) {
    throw new PageGuestServiceError("Page invitation not found.", 404);
  }

  if (!canAcceptPageGuestInvitation(invitation, input.userEmail, now)) {
    throw new PageGuestServiceError(
      "This page invitation is invalid, expired, or belongs to another email.",
      409,
    );
  }

  return db.transaction(async (tx) => {
    const [accepted] = await tx
      .update(pageGuestInvitation)
      .set({
        acceptedAt: now,
        acceptedByUserId: input.userId,
        status: "accepted",
        updatedAt: now,
      })
      .where(
        and(
          eq(pageGuestInvitation.id, invitation.id),
          eq(pageGuestInvitation.status, "pending"),
          gt(pageGuestInvitation.expiresAt, now),
        ),
      )
      .returning();

    if (!accepted) {
      throw new PageGuestServiceError(
        "This page invitation is no longer available.",
        409,
      );
    }

    const [membership] = await tx
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.organizationId, invitation.workspaceId),
          eq(member.userId, input.userId),
          activeMembershipCondition(),
        ),
      )
      .limit(1);

    if (!membership) {
      await tx
        .insert(workspaceGuest)
        .values({
          id: crypto.randomUUID(),
          invitedById: accepted.inviterId,
          userId: input.userId,
          workspaceId: invitation.workspaceId,
        })
        .onConflictDoUpdate({
          target: [workspaceGuest.workspaceId, workspaceGuest.userId],
          set: { invitedById: accepted.inviterId, updatedAt: now },
        });
    }

    const [access] = await tx
      .insert(pageAccess)
      .values({
        accessLevel: invitation.accessLevel,
        id: crypto.randomUUID(),
        pageId: invitation.pageId,
        targetId: input.userId,
        targetType: "user",
        workspaceId: invitation.workspaceId,
      })
      .onConflictDoUpdate({
        target: [pageAccess.pageId, pageAccess.targetType, pageAccess.targetId],
        set: { accessLevel: invitation.accessLevel, updatedAt: now },
      })
      .returning();

    return { access, invitation: accepted, pageId: invitation.pageId };
  });
}

export async function listPageGuestInvitations(pageId: string, userId: string) {
  const [pageRecord] = await db
    .select({ id: page.id, workspaceId: page.workspaceId })
    .from(page)
    .where(and(eq(page.id, pageId), isNull(page.deletedAt)))
    .limit(1);

  if (!pageRecord) throw new PageGuestServiceError("Page not found.", 404);

  const access = await getEffectivePageAccessInWorkspace(
    pageRecord.id,
    pageRecord.workspaceId,
    userId,
  );

  if (!hasAccess(access, "full")) {
    throw new PageGuestServiceError("Forbidden", 403);
  }

  return db
    .select()
    .from(pageGuestInvitation)
    .where(eq(pageGuestInvitation.pageId, pageId))
    .orderBy(asc(pageGuestInvitation.createdAt));
}

export async function cancelPageGuestInvitation(input: {
  invitationId: string;
  pageId: string;
  userId: string;
}) {
  await listPageGuestInvitations(input.pageId, input.userId);
  const [invitation] = await db
    .update(pageGuestInvitation)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(pageGuestInvitation.id, input.invitationId),
        eq(pageGuestInvitation.pageId, input.pageId),
        eq(pageGuestInvitation.status, "pending"),
      ),
    )
    .returning();

  if (!invitation) {
    throw new PageGuestServiceError("Pending page invitation not found.", 404);
  }

  return invitation;
}

export async function revokePageGuestAccess(input: {
  pageId: string;
  targetUserId: string;
  userId: string;
}) {
  const [pageRecord] = await db
    .select({ id: page.id, workspaceId: page.workspaceId })
    .from(page)
    .where(and(eq(page.id, input.pageId), isNull(page.deletedAt)))
    .limit(1);

  if (!pageRecord) throw new PageGuestServiceError("Page not found.", 404);
  const actorAccess = await getEffectivePageAccessInWorkspace(
    pageRecord.id,
    pageRecord.workspaceId,
    input.userId,
  );

  if (!hasAccess(actorAccess, "full")) {
    throw new PageGuestServiceError("Forbidden", 403);
  }

  return db.transaction(async (tx) => {
    const [guest] = await tx
      .select({ id: workspaceGuest.id })
      .from(workspaceGuest)
      .where(
        and(
          eq(workspaceGuest.workspaceId, pageRecord.workspaceId),
          eq(workspaceGuest.userId, input.targetUserId),
        ),
      )
      .limit(1);

    if (!guest) {
      throw new PageGuestServiceError("Page guest not found.", 404);
    }

    const [access] = await tx
      .delete(pageAccess)
      .where(
        and(
          eq(pageAccess.pageId, input.pageId),
          eq(pageAccess.targetType, "user"),
          eq(pageAccess.targetId, input.targetUserId),
        ),
      )
      .returning();

    if (!access) {
      throw new PageGuestServiceError("Guest page access not found.", 404);
    }

    const [remaining] = await tx
      .select({ id: pageAccess.id })
      .from(pageAccess)
      .where(
        and(
          eq(pageAccess.workspaceId, pageRecord.workspaceId),
          eq(pageAccess.targetType, "user"),
          eq(pageAccess.targetId, input.targetUserId),
        ),
      )
      .limit(1);

    if (!remaining) {
      await tx
        .delete(workspaceGuest)
        .where(
          and(
            eq(workspaceGuest.workspaceId, pageRecord.workspaceId),
            eq(workspaceGuest.userId, input.targetUserId),
          ),
        );
    }

    return access;
  });
}

export async function listWorkspaceGuests(workspaceId: string) {
  const rows = await db
    .select({
      accessLevel: pageAccess.accessLevel,
      createdAt: workspaceGuest.createdAt,
      email: user.email,
      name: user.name,
      pageId: pageAccess.pageId,
      pageName: page.name,
      userId: user.id,
    })
    .from(workspaceGuest)
    .innerJoin(user, eq(user.id, workspaceGuest.userId))
    .leftJoin(
      pageAccess,
      and(
        eq(pageAccess.workspaceId, workspaceGuest.workspaceId),
        eq(pageAccess.targetType, "user"),
        eq(pageAccess.targetId, workspaceGuest.userId),
      ),
    )
    .leftJoin(page, eq(page.id, pageAccess.pageId))
    .where(eq(workspaceGuest.workspaceId, workspaceId))
    .orderBy(asc(user.name), asc(user.email), asc(page.name));
  const guests = new Map<
    string,
    {
      createdAt: Date;
      email: string;
      name: string;
      pages: { accessLevel: string; id: string; name: string }[];
      userId: string;
    }
  >();

  for (const row of rows) {
    const guest = guests.get(row.userId) ?? {
      createdAt: row.createdAt,
      email: row.email,
      name: row.name,
      pages: [],
      userId: row.userId,
    };

    if (row.pageId && row.pageName && row.accessLevel) {
      guest.pages.push({
        accessLevel: row.accessLevel,
        id: row.pageId,
        name: row.pageName,
      });
    }

    guests.set(row.userId, guest);
  }

  return [...guests.values()];
}

export async function revokeWorkspaceGuest(
  workspaceId: string,
  targetUserId: string,
) {
  return db.transaction(async (tx) => {
    await tx
      .delete(pageAccess)
      .where(
        and(
          eq(pageAccess.workspaceId, workspaceId),
          eq(pageAccess.targetType, "user"),
          eq(pageAccess.targetId, targetUserId),
        ),
      );
    const [guest] = await tx
      .delete(workspaceGuest)
      .where(
        and(
          eq(workspaceGuest.workspaceId, workspaceId),
          eq(workspaceGuest.userId, targetUserId),
        ),
      )
      .returning();

    if (!guest) {
      throw new PageGuestServiceError("Workspace guest not found.", 404);
    }

    return guest;
  });
}
