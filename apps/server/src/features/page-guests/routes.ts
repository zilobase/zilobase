import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";

import { getMembership, isPrivilegedOrgRole } from "../../access";
import { rejectMismatchedApiKeyWorkspace } from "../../api-keys";
import { getPrimaryClientOrigin } from "../../config";
import { sendEmail } from "../../email";
import {
  acceptPageGuestInvitation,
  cancelPageGuestInvitation,
  createPageGuestInvitation,
  getPageGuestInvitation,
  listPageGuestInvitations,
  listWorkspaceGuests,
  PageGuestServiceError,
  revokePageGuestAccess,
  revokeWorkspaceGuest,
} from "../../services/page-guest-service";
import type { AppBindings } from "../../types";

export const pageGuestRoutes = new Hono<AppBindings>();

const invitationSchema = z
  .object({
    accessLevel: z.enum(["view", "edit", "full"]),
    email: z.string().trim().email(),
  })
  .strict();

pageGuestRoutes.post("/pages/:pageId/guest-invitations", async (c) => {
  const requestUser = c.get("user");

  if (!requestUser) return c.json({ error: "Unauthorized" }, 401);
  const parsed = invitationSchema.safeParse(await c.req.json().catch(() => null));

  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid page invitation." },
      400,
    );
  }

  try {
    const result = await createPageGuestInvitation({
      ...parsed.data,
      inviterId: requestUser.id,
      pageId: c.req.param("pageId"),
    });
    const invitationUrl = `${getPrimaryClientOrigin(c.env)}/accept-page-invitation?id=${result.invitation.id}`;

    await sendEmail(c.env, {
      subject: `${requestUser.name} invited you to ${result.page.name} on Zilobase`,
      text: [
        `${requestUser.name} (${requestUser.email}) invited you as a guest to “${result.page.name}” in ${result.workspace.name}.`,
        `Permission: ${result.invitation.accessLevel}.`,
        `This invitation expires ${result.invitation.expiresAt.toISOString()}.`,
        "",
        `Accept invitation: ${invitationUrl}`,
      ].join("\n"),
      to: result.invitation.email,
    });

    return c.json({ invitation: result.invitation }, 201);
  } catch (error) {
    return pageGuestErrorResponse(c, error);
  }
});

pageGuestRoutes.get("/pages/:pageId/guest-invitations", async (c) => {
  const requestUser = c.get("user");

  if (!requestUser) return c.json({ error: "Unauthorized" }, 401);

  try {
    return c.json({
      invitations: await listPageGuestInvitations(
        c.req.param("pageId"),
        requestUser.id,
      ),
    });
  } catch (error) {
    return pageGuestErrorResponse(c, error);
  }
});

pageGuestRoutes.delete(
  "/pages/:pageId/guest-invitations/:invitationId",
  async (c) => {
    const requestUser = c.get("user");

    if (!requestUser) return c.json({ error: "Unauthorized" }, 401);

    try {
      return c.json({
        invitation: await cancelPageGuestInvitation({
          invitationId: c.req.param("invitationId"),
          pageId: c.req.param("pageId"),
          userId: requestUser.id,
        }),
      });
    } catch (error) {
      return pageGuestErrorResponse(c, error);
    }
  },
);

pageGuestRoutes.delete("/pages/:pageId/guests/:userId", async (c) => {
  const requestUser = c.get("user");

  if (!requestUser) return c.json({ error: "Unauthorized" }, 401);

  try {
    return c.json({
      access: await revokePageGuestAccess({
        pageId: c.req.param("pageId"),
        targetUserId: c.req.param("userId"),
        userId: requestUser.id,
      }),
    });
  } catch (error) {
    return pageGuestErrorResponse(c, error);
  }
});

pageGuestRoutes.get("/page-guest-invitations/:invitationId", async (c) => {
  const invitation = await getPageGuestInvitation(c.req.param("invitationId"));

  if (!invitation) return c.json({ error: "Page invitation not found." }, 404);
  const status =
    invitation.status === "pending" && invitation.expiresAt <= new Date()
      ? "expired"
      : invitation.status;

  return c.json({ invitation: { ...invitation, status } });
});

pageGuestRoutes.post("/page-guest-invitations/:invitationId/accept", async (c) => {
  const requestUser = c.get("user");

  if (!requestUser) return c.json({ error: "Unauthorized" }, 401);

  try {
    return c.json(
      await acceptPageGuestInvitation({
        invitationId: c.req.param("invitationId"),
        userEmail: requestUser.email,
        userId: requestUser.id,
      }),
    );
  } catch (error) {
    return pageGuestErrorResponse(c, error);
  }
});

pageGuestRoutes.get("/workspaces/:workspaceId/guests", async (c) => {
  const requestUser = c.get("user");

  if (!requestUser) return c.json({ error: "Unauthorized" }, 401);
  const workspaceId = c.req.param("workspaceId");
  const mismatch = rejectMismatchedApiKeyWorkspace(c, workspaceId);

  if (mismatch) return mismatch;
  const membership = await getMembership(workspaceId, requestUser.id);

  if (!membership || !isPrivilegedOrgRole(membership.role)) {
    return c.json({ error: "Only workspace admins can manage guests." }, 403);
  }

  return c.json({ guests: await listWorkspaceGuests(workspaceId) });
});

pageGuestRoutes.delete("/workspaces/:workspaceId/guests/:userId", async (c) => {
  const requestUser = c.get("user");

  if (!requestUser) return c.json({ error: "Unauthorized" }, 401);
  const workspaceId = c.req.param("workspaceId");
  const mismatch = rejectMismatchedApiKeyWorkspace(c, workspaceId);

  if (mismatch) return mismatch;
  const membership = await getMembership(workspaceId, requestUser.id);

  if (!membership || !isPrivilegedOrgRole(membership.role)) {
    return c.json({ error: "Only workspace admins can manage guests." }, 403);
  }

  try {
    return c.json({
      guest: await revokeWorkspaceGuest(workspaceId, c.req.param("userId")),
    });
  } catch (error) {
    return pageGuestErrorResponse(c, error);
  }
});

function pageGuestErrorResponse(c: Context<AppBindings>, error: unknown) {
  if (error instanceof PageGuestServiceError) {
    return c.json({ error: error.message }, error.status);
  }

  throw error;
}
