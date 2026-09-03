import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";

import { getMembership, isPrivilegedOrgRole } from "../access";
import { rejectMismatchedApiKeyWorkspace } from "../api-keys";
import { getPrimaryClientOrigin } from "../../shared/config/config";
import { sendEmail } from "../../infrastructure/email/email";
import {
  acceptPageGuestInvitation,
  approvePageGuestRequest,
  cancelPageGuestInvitation,
  getWorkspaceGuestInvitePolicy,
  getPageGuestInvitation,
  listPageGuestRequests,
  listPageGuestInvitations,
  listWorkspaceGuestRequests,
  listWorkspaceGuests,
  PageGuestServiceError,
  promoteWorkspaceGuest,
  rejectPageGuestRequest,
  revokePageGuestAccess,
  revokeWorkspaceGuest,
  submitPageGuestInvitation,
  updateWorkspaceGuestInvitePolicy,
} from "./service";
import type { AppBindings } from "../../shared/types";
import { readJsonBody } from "../../shared/http/request";
import { getPageTeamspaceSecurityPolicy } from "../teamspaces";

export const pageGuestRoutes = new Hono<AppBindings>();

const invitationSchema = z
  .object({
    accessLevel: z.enum(["view", "comment", "edit", "full"]),
    email: z.string().trim().email(),
  })
  .strict();

pageGuestRoutes.post("/pages/:pageId/guest-invitations", async (c) => {
  const requestUser = c.get("user");

  if (!requestUser) return c.json({ error: "Unauthorized" }, 401);
  const parsed = invitationSchema.safeParse(await readJsonBody(c.req));

  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid page invitation." },
      400,
    );
  }

  const teamspacePolicy = await getPageTeamspaceSecurityPolicy(
    c.req.param("pageId"),
  );
  if (teamspacePolicy && !teamspacePolicy.guestsEnabled) {
    return c.json({ error: "Guest access is disabled for this teamspace." }, 403);
  }

  try {
    const result = await submitPageGuestInvitation({
      ...parsed.data,
      inviterId: requestUser.id,
      pageId: c.req.param("pageId"),
    });
    if (result.kind === "request") {
      return c.json({ request: result.request }, 202);
    }
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

pageGuestRoutes.get("/pages/:pageId/guest-requests", async (c) => {
  const requestUser = c.get("user");
  if (!requestUser) return c.json({ error: "Unauthorized" }, 401);
  try {
    return c.json({
      requests: await listPageGuestRequests(
        c.req.param("pageId"),
        requestUser.id,
      ),
    });
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

pageGuestRoutes.get("/workspaces/:workspaceId/guest-policy", async (c) => {
  const requestUser = c.get("user");
  if (!requestUser) return c.json({ error: "Unauthorized" }, 401);
  const workspaceId = c.req.param("workspaceId");
  const mismatch = rejectMismatchedApiKeyWorkspace(c, workspaceId);
  if (mismatch) return mismatch;
  try {
    return c.json({
      policy: await getWorkspaceGuestInvitePolicy(workspaceId, requestUser.id),
    });
  } catch (error) {
    return pageGuestErrorResponse(c, error);
  }
});

pageGuestRoutes.patch("/workspaces/:workspaceId/guest-policy", async (c) => {
  const requestUser = c.get("user");
  if (!requestUser) return c.json({ error: "Unauthorized" }, 401);
  const workspaceId = c.req.param("workspaceId");
  const mismatch = rejectMismatchedApiKeyWorkspace(c, workspaceId);
  if (mismatch) return mismatch;
  const parsed = z
    .object({ mode: z.enum(["direct", "request", "owners_only"]) })
    .strict()
    .safeParse(await readJsonBody(c.req));
  if (!parsed.success) return c.json({ error: "Invalid guest policy." }, 400);
  try {
    return c.json({
      policy: await updateWorkspaceGuestInvitePolicy({
        mode: parsed.data.mode,
        userId: requestUser.id,
        workspaceId,
      }),
    });
  } catch (error) {
    return pageGuestErrorResponse(c, error);
  }
});

pageGuestRoutes.get("/workspaces/:workspaceId/guest-requests", async (c) => {
  const requestUser = c.get("user");
  if (!requestUser) return c.json({ error: "Unauthorized" }, 401);
  const workspaceId = c.req.param("workspaceId");
  const mismatch = rejectMismatchedApiKeyWorkspace(c, workspaceId);
  if (mismatch) return mismatch;
  try {
    return c.json({
      requests: await listWorkspaceGuestRequests(workspaceId, requestUser.id),
    });
  } catch (error) {
    return pageGuestErrorResponse(c, error);
  }
});

pageGuestRoutes.post(
  "/workspaces/:workspaceId/guest-requests/:requestId/reject",
  async (c) => {
    const requestUser = c.get("user");
    if (!requestUser) return c.json({ error: "Unauthorized" }, 401);
    try {
      return c.json({
        request: await rejectPageGuestRequest({
          requestId: c.req.param("requestId"),
          reviewerId: requestUser.id,
          workspaceId: c.req.param("workspaceId"),
        }),
      });
    } catch (error) {
      return pageGuestErrorResponse(c, error);
    }
  },
);

pageGuestRoutes.post(
  "/workspaces/:workspaceId/guest-requests/:requestId/approve",
  async (c) => {
    const requestUser = c.get("user");
    if (!requestUser) return c.json({ error: "Unauthorized" }, 401);
    try {
      const result = await approvePageGuestRequest({
        requestId: c.req.param("requestId"),
        reviewerId: requestUser.id,
        workspaceId: c.req.param("workspaceId"),
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
      return c.json({ invitation: result.invitation, request: result.request });
    } catch (error) {
      return pageGuestErrorResponse(c, error);
    }
  },
);

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

pageGuestRoutes.post(
  "/workspaces/:workspaceId/guests/:userId/promote",
  async (c) => {
    const requestUser = c.get("user");
    if (!requestUser) return c.json({ error: "Unauthorized" }, 401);
    const workspaceId = c.req.param("workspaceId");
    const membership = await getMembership(workspaceId, requestUser.id);
    if (!membership || membership.role !== "owner") {
      return c.json({ error: "Only workspace owners can convert guests." }, 403);
    }
    try {
      return c.json({
        member: await promoteWorkspaceGuest({
          editionExtension: c.get("editionExtension") ?? undefined,
          targetUserId: c.req.param("userId"),
          workspaceId,
        }),
      });
    } catch (error) {
      return pageGuestErrorResponse(c, error);
    }
  },
);

function pageGuestErrorResponse(c: Context<AppBindings>, error: unknown) {
  if (error instanceof PageGuestServiceError) {
    return c.json({ error: error.message }, error.status);
  }

  throw error;
}
