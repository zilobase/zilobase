import { parseOperationBody } from "../../shared/validation";
import { getMembership } from "../access/principal-access";
import {
  requireOperationActor,
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import { DeleteWorkspaceInput } from "./input";
import { deleteWorkspace, getWorkspace, listWorkspaces } from "./workspaces";

export type ListWorkspacesOperationInput = {};
export async function listWorkspacesOperation(
  context: ServerOperationContext,
  operationInput: ListWorkspacesOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: "workspaces.read" });

  const requestUser = requireOperationActor(context);
  const pinnedWorkspaceId = context.pinnedWorkspaceId;
  const records = await listWorkspaces(requestUser.id, pinnedWorkspaceId);
  return { workspaces: records.map(({ workspace: record }) => record) };
}

export type GetWorkspaceOperationInput = { workspaceId: string };
export async function getWorkspaceOperation(
  context: ServerOperationContext,
  operationInput: GetWorkspaceOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: "workspaces.read" });

  const requestUser = requireOperationActor(context);
  const workspaceId = operationInput.workspaceId;
  requireOperationWorkspace(context, workspaceId);

  if (!(await getMembership(workspaceId, requestUser.id))) {
    return deny({ error: "Forbidden" }, 403);
  }
  const record = await getWorkspace(workspaceId);
  return record ? { workspace: record } : deny({ error: "Workspace not found" }, 404);
}

export type DeleteWorkspaceOperationInput = { workspaceId: string; body?: unknown };
export async function deleteWorkspaceOperation(
  context: ServerOperationContext,
  operationInput: DeleteWorkspaceOperationInput,
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

  const requestUser = requireOperationActor(context);
  const workspaceId = operationInput.workspaceId;
  requireOperationWorkspace(context, workspaceId);

  const membership = await getMembership(workspaceId, requestUser.id);
  if (!membership || membership.role !== "owner") {
    return deny({ error: "Only the workspace owner can delete this workspace." }, 403);
  }
  const parsed = await parseOperationBody(DeleteWorkspaceInput, readBody);
  if (!parsed.ok) {
    return deny({ error: "Enter the workspace name to confirm deletion." }, 400);
  }
  await deleteWorkspace(workspaceId, parsed.data.confirmationName);
  return { deleted: true, workspaceId };
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
