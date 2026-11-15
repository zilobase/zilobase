import { z } from "zod";
import { sendEmail } from "../../infrastructure/email/email";
import { getPrimaryClientOrigin } from "../../shared/config/config";
import { parseUnknown } from "../../shared/validation";
import {
  requireOperationActor,
  requireOperationPolicy,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import { getPageTeamspaceSecurityPolicy } from "../teamspaces/security";
import {
  acceptPageGuestInvitation,
  cancelPageGuestInvitation,
  getPageGuestInvitation,
  listPageGuestInvitations,
  revokePageGuestAccess,
  submitPageGuestInvitation,
} from "./invitations/invitations";
import { listPageGuestRequests } from "./requests/requests";
const GuestInvitation = z.strictObject({
  accessLevel: z.enum(["view", "comment", "edit", "full"]),
  email: z
    .string()
    .trim()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
});

export async function invitePageGuestOperation(
  context: ServerOperationContext,
  input: { pageId: string; body: unknown },
  readBody?: () => Promise<unknown>,
) {
  requireOperationPolicy(context, { write: true, oauthScope: "pages.write" });
  const user = requireOperationActor(context);
  const parsed = await parseUnknown(GuestInvitation, readBody ? await readBody() : input.body);
  if (!parsed.ok)
    throw new ServerOperationError({ error: parsed.message || "Invalid page invitation." }, 400);
  const teamspacePolicy = await getPageTeamspaceSecurityPolicy(input.pageId);
  if (teamspacePolicy && !teamspacePolicy.guestsEnabled)
    throw new ServerOperationError({ error: "Guest access is disabled for this teamspace." }, 403);
  const result = await submitPageGuestInvitation({
    ...parsed.data,
    inviterId: user.id,
    pageId: input.pageId,
  });
  if (result.kind === "request") return result;
  const invitationUrl = `${getPrimaryClientOrigin(context.env)}/accept-page-invitation?id=${result.invitation.id}`;
  await sendEmail(context.env, {
    subject: `${user.name} invited you to ${result.page.name} on Zilobase`,
    text: [
      `${user.name} (${user.email}) invited you as a guest to “${result.page.name}” in ${result.workspace.name}.`,
      `Permission: ${result.invitation.accessLevel}.`,
      `This invitation expires ${result.invitation.expiresAt.toISOString()}.`,
      "",
      `Accept invitation: ${invitationUrl}`,
    ].join("\n"),
    to: result.invitation.email,
  });
  return result;
}
export async function listPageGuestInvitationsOperation(
  context: ServerOperationContext,
  input: { pageId: string },
) {
  requireOperationPolicy(context, { write: false, oauthScope: "pages.read" });
  const user = requireOperationActor(context);
  return { invitations: await listPageGuestInvitations(input.pageId, user.id) };
}
export async function listPageGuestRequestsOperation(
  context: ServerOperationContext,
  input: { pageId: string },
) {
  requireOperationPolicy(context, { write: false, oauthScope: "pages.read" });
  const user = requireOperationActor(context);
  return { requests: await listPageGuestRequests(input.pageId, user.id) };
}
export async function cancelPageGuestInvitationOperation(
  context: ServerOperationContext,
  input: { pageId: string; invitationId: string },
) {
  requireOperationPolicy(context, { write: true, oauthScope: "pages.write" });
  const user = requireOperationActor(context);
  return {
    invitation: await cancelPageGuestInvitation({
      pageId: input.pageId,
      invitationId: input.invitationId,
      userId: user.id,
    }),
  };
}
export async function revokePageGuestOperation(
  context: ServerOperationContext,
  input: { pageId: string; targetUserId: string },
) {
  requireOperationPolicy(context, { write: true, oauthScope: "pages.write" });
  const user = requireOperationActor(context);
  return {
    access: await revokePageGuestAccess({
      pageId: input.pageId,
      targetUserId: input.targetUserId,
      userId: user.id,
    }),
  };
}
export async function getPageGuestInvitationOperation(
  context: ServerOperationContext,
  input: { invitationId: string },
) {
  requireOperationPolicy(context, { write: false });
  const invitation = await getPageGuestInvitation(input.invitationId);
  if (!invitation) throw new ServerOperationError({ error: "Page invitation not found." }, 404);
  const status =
    invitation.status === "pending" && invitation.expiresAt <= new Date()
      ? "expired"
      : invitation.status;
  return { invitation: { ...invitation, status } };
}
export async function acceptPageGuestInvitationOperation(
  context: ServerOperationContext,
  input: { invitationId: string },
) {
  requireOperationPolicy(context, { write: true });
  const user = requireOperationActor(context);
  return acceptPageGuestInvitation({
    invitationId: input.invitationId,
    userEmail: user.email,
    userId: user.id,
  });
}
