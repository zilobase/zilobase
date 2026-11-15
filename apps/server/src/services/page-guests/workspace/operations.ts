import { z } from "zod";
import { sendEmail } from "../../../infrastructure/email/email";
import { getPrimaryClientOrigin } from "../../../shared/config/config";
import { parseOperationBody } from "../../../shared/validation";
import { getMembership, isPrivilegedOrgRole } from "../../access/principal-access";
import {
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../../operations/context";
import { PageGuestServiceError } from "../policy";
import {
  approvePageGuestRequest,
  listWorkspaceGuestRequests,
  rejectPageGuestRequest,
} from "../requests/requests";
import {
  getWorkspaceGuestInvitePolicy,
  listWorkspaceGuests,
  promoteWorkspaceGuest,
  revokeWorkspaceGuest,
  updateWorkspaceGuestInvitePolicy,
} from "./workspace-guests";
const GuestPolicy = z.strictObject({
  mode: z.enum(["direct", "request", "owners_only"]),
});
export type ListWorkspaceGuestsOperationInput = { workspaceId: string };
export async function listWorkspaceGuestsOperation(
  context: ServerOperationContext,
  operationInput: ListWorkspaceGuestsOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const requestUser = context.authentication.user;
  if (!requestUser) return deny({ error: "Unauthorized" }, 401);
  const workspaceId = operationInput.workspaceId;
  requireOperationWorkspace(context, workspaceId);

  const membership = await getMembership(workspaceId, requestUser.id);
  if (!membership || !isPrivilegedOrgRole(membership.role)) {
    return deny({ error: "Only workspace admins can manage guests." }, 403);
  }
  return { guests: await listWorkspaceGuests(workspaceId) };
}

export type GetWorkspaceGuestPolicyOperationInput = { workspaceId: string };
export async function getWorkspaceGuestPolicyOperation(
  context: ServerOperationContext,
  operationInput: GetWorkspaceGuestPolicyOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const requestUser = context.authentication.user;
  if (!requestUser) return deny({ error: "Unauthorized" }, 401);
  const workspaceId = operationInput.workspaceId;
  requireOperationWorkspace(context, workspaceId);

  try {
    return {
      policy: await getWorkspaceGuestInvitePolicy(workspaceId, requestUser.id),
    };
  } catch (error) {
    return pageGuestError(error);
  }
}

export type UpdateWorkspaceGuestPolicyOperationInput = { workspaceId: string; body?: unknown };
export async function updateWorkspaceGuestPolicyOperation(
  context: ServerOperationContext,
  operationInput: UpdateWorkspaceGuestPolicyOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const requestUser = context.authentication.user;
  if (!requestUser) return deny({ error: "Unauthorized" }, 401);
  const workspaceId = operationInput.workspaceId;
  requireOperationWorkspace(context, workspaceId);

  const parsed = await parseOperationBody(GuestPolicy, readBody);
  if (!parsed.ok) return deny({ error: "Invalid guest policy." }, 400);
  try {
    return {
      policy: await updateWorkspaceGuestInvitePolicy({
        mode: parsed.data.mode,
        userId: requestUser.id,
        workspaceId,
      }),
    };
  } catch (error) {
    return pageGuestError(error);
  }
}

export type ListWorkspaceGuestRequestsOperationInput = { workspaceId: string };
export async function listWorkspaceGuestRequestsOperation(
  context: ServerOperationContext,
  operationInput: ListWorkspaceGuestRequestsOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const requestUser = context.authentication.user;
  if (!requestUser) return deny({ error: "Unauthorized" }, 401);
  const workspaceId = operationInput.workspaceId;
  requireOperationWorkspace(context, workspaceId);

  try {
    return {
      requests: await listWorkspaceGuestRequests(workspaceId, requestUser.id),
    };
  } catch (error) {
    return pageGuestError(error);
  }
}

export type RejectWorkspaceGuestRequestOperationInput = { requestId: string; workspaceId: string };
export async function rejectWorkspaceGuestRequestOperation(
  context: ServerOperationContext,
  operationInput: RejectWorkspaceGuestRequestOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const requestUser = context.authentication.user;
  if (!requestUser) return deny({ error: "Unauthorized" }, 401);
  try {
    return {
      request: await rejectPageGuestRequest({
        requestId: operationInput.requestId,
        reviewerId: requestUser.id,
        workspaceId: operationInput.workspaceId,
      }),
    };
  } catch (error) {
    return pageGuestError(error);
  }
}

export type ApproveWorkspaceGuestRequestOperationInput = { requestId: string; workspaceId: string };
export async function approveWorkspaceGuestRequestOperation(
  context: ServerOperationContext,
  operationInput: ApproveWorkspaceGuestRequestOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const requestUser = context.authentication.user;
  if (!requestUser) return deny({ error: "Unauthorized" }, 401);
  try {
    const result = await approvePageGuestRequest({
      requestId: operationInput.requestId,
      reviewerId: requestUser.id,
      workspaceId: operationInput.workspaceId,
    });
    const invitationUrl = `${getPrimaryClientOrigin(context.env)}/accept-page-invitation?id=${result.invitation.id}`;
    await sendEmail(context.env, {
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
    return { invitation: result.invitation, request: result.request };
  } catch (error) {
    return pageGuestError(error);
  }
}

export type RevokeWorkspaceGuestOperationInput = { workspaceId: string; userId: string };
export async function revokeWorkspaceGuestOperation(
  context: ServerOperationContext,
  operationInput: RevokeWorkspaceGuestOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const requestUser = context.authentication.user;
  if (!requestUser) return deny({ error: "Unauthorized" }, 401);
  const workspaceId = operationInput.workspaceId;
  requireOperationWorkspace(context, workspaceId);

  const membership = await getMembership(workspaceId, requestUser.id);
  if (!membership || !isPrivilegedOrgRole(membership.role)) {
    return deny({ error: "Only workspace admins can manage guests." }, 403);
  }
  try {
    return {
      guest: await revokeWorkspaceGuest(workspaceId, operationInput.userId),
    };
  } catch (error) {
    return pageGuestError(error);
  }
}

export type PromoteWorkspaceGuestOperationInput = { workspaceId: string; userId: string };
export async function promoteWorkspaceGuestOperation(
  context: ServerOperationContext,
  operationInput: PromoteWorkspaceGuestOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const requestUser = context.authentication.user;
  if (!requestUser) return deny({ error: "Unauthorized" }, 401);
  const workspaceId = operationInput.workspaceId;
  const membership = await getMembership(workspaceId, requestUser.id);
  if (!membership || membership.role !== "owner") {
    return deny({ error: "Only workspace owners can convert guests." }, 403);
  }
  try {
    return {
      member: await promoteWorkspaceGuest({
        editionExtension: context.editionExtension ?? undefined,
        targetUserId: operationInput.userId,
        workspaceId,
      }),
    };
  } catch (error) {
    return pageGuestError(error);
  }
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}

function pageGuestError(error: unknown): never {
  if (error instanceof PageGuestServiceError)
    throw new ServerOperationError({ error: error.message }, error.status);
  throw error;
}
