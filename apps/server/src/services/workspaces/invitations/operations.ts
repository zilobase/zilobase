import { parseOperationBody } from "../../../shared/validation";
import { getMembership, isPrivilegedOrgRole } from "../../access/principal-access";
import {
  parseMembershipAccessExpiry,
  TemporaryMembershipValidationError,
} from "../../memberships/temporary-membership";
import {
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../../operations/context";
import { MemberInvitationInput } from "../input";
import { createWorkspaceInvitation } from "./workspace-invitations";

export type InviteWorkspaceMemberOperationInput = { workspaceId: string; body?: unknown };
export async function inviteWorkspaceMemberOperation(
  context: ServerOperationContext,
  operationInput: InviteWorkspaceMemberOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  if (context.authentication.authMethod === "oauth")
    throw new ServerOperationError(
      {
        error: "insufficient_scope",
        error_description: "OAuth tokens cannot change workspace membership.",
      },
      403,
    );
  requireOperationPolicy(context, { write: true, oauthScope: undefined });

  const requestUser = context.authentication.user;
  if (!requestUser) {
    return deny({ error: "Unauthorized" }, 401);
  }
  const workspaceId = operationInput.workspaceId;
  requireOperationWorkspace(context, workspaceId);

  const actorMembership = await getMembership(workspaceId, requestUser.id);
  if (!actorMembership || !isPrivilegedOrgRole(actorMembership.role)) {
    return deny({ error: "Only workspace admins can invite members." }, 403);
  }
  const parsed = await parseOperationBody(MemberInvitationInput, readBody);
  if (!parsed.ok) {
    return deny({ error: parsed.message || "Invalid invitation." }, 400);
  }
  let membershipExpiresAt: Date | null;
  try {
    membershipExpiresAt = parseMembershipAccessExpiry(
      parsed.data.role,
      parsed.data.accessExpiresAt,
    );
  } catch (error) {
    if (error instanceof TemporaryMembershipValidationError) {
      return deny({ error: error.message }, 400);
    }
    throw error;
  }
  const created = await createWorkspaceInvitation(
    workspaceId,
    requestUser,
    parsed.data,
    membershipExpiresAt,
    context.env,
  );
  return { invitation: created };
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
