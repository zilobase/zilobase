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
import { MemberUpdateInput } from "../input";
import {
  getWorkspaceAccessTargets,
  removeWorkspaceMember,
  updateWorkspaceMember,
} from "./workspace-members";

export type GetWorkspaceAccessTargetsOperationInput = { workspaceId: string };
export async function getWorkspaceAccessTargetsOperation(
  context: ServerOperationContext,
  operationInput: GetWorkspaceAccessTargetsOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const requestUser = context.authentication.user;
  if (!requestUser) {
    return deny({ error: "Unauthorized" }, 401);
  }
  const workspaceId = operationInput.workspaceId;
  requireOperationWorkspace(context, workspaceId);

  if (!(await getMembership(workspaceId, requestUser.id))) {
    return deny({ error: "Forbidden" }, 403);
  }
  const { members, teams } = await getWorkspaceAccessTargets(workspaceId);
  return { members, teams };
}

export type UpdateWorkspaceMemberOperationInput = {
  workspaceId: string;
  memberId: string;
  body?: unknown;
};
export async function updateWorkspaceMemberOperation(
  context: ServerOperationContext,
  operationInput: UpdateWorkspaceMemberOperationInput,
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
  requireOperationWorkspace(context, operationInput.workspaceId);

  const requestUser = context.authentication.user;
  if (!requestUser) {
    return deny({ error: "Unauthorized" }, 401);
  }
  const workspaceId = operationInput.workspaceId;
  const actorMembership = await getMembership(workspaceId, requestUser.id);
  if (!actorMembership || !isPrivilegedOrgRole(actorMembership.role)) {
    return deny({ error: "Only workspace admins can manage members." }, 403);
  }
  const parsed = await parseOperationBody(MemberUpdateInput, readBody);
  if (!parsed.ok) {
    return deny({ error: parsed.message || "Invalid member update." }, 400);
  }
  let accessExpiresAt: Date | null;
  try {
    accessExpiresAt = parseMembershipAccessExpiry(parsed.data.role, parsed.data.accessExpiresAt);
  } catch (error) {
    if (error instanceof TemporaryMembershipValidationError) {
      return deny({ error: error.message }, 400);
    }
    throw error;
  }
  const updatedMember = await updateWorkspaceMember(
    workspaceId,
    operationInput.memberId,
    requestUser,
    actorMembership,
    parsed.data,
    accessExpiresAt,
    context.editionExtension,
  );
  return { member: updatedMember };
}

export type RemoveWorkspaceMemberOperationInput = { workspaceId: string; memberId: string };
export async function removeWorkspaceMemberOperation(
  context: ServerOperationContext,
  operationInput: RemoveWorkspaceMemberOperationInput,
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
  requireOperationWorkspace(context, operationInput.workspaceId);

  const requestUser = context.authentication.user;
  if (!requestUser) {
    return deny({ error: "Unauthorized" }, 401);
  }
  const workspaceId = operationInput.workspaceId;
  const actorMembership = await getMembership(workspaceId, requestUser.id);
  if (!actorMembership || !isPrivilegedOrgRole(actorMembership.role)) {
    return deny({ error: "Only workspace admins can remove members." }, 403);
  }
  await removeWorkspaceMember(
    workspaceId,
    operationInput.memberId,
    requestUser,
    context.editionExtension,
  );
  return { removed: true };
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
