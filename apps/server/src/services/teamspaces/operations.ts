import { z } from "zod";
import { parseOperationBody } from "../../shared/validation";
import {
  requireOperationActor,
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import { TeamspaceManagementService } from "./management";
const TeamspaceAccessMode = z.enum(["open", "closed", "private"]);
const TeamspaceRole = z.enum(["owner", "member"]);
const MemberAccessLevel = z.enum(["view", "comment", "edit", "full"]);
const PrincipalType = z.enum(["user", "team"]);
const InvitePolicy = z.enum(["owners", "owners_and_members"]);
const SidebarEditPolicy = z.enum(["owners", "owners_and_members"]);
const CreationPolicy = z.enum(["workspace_owners", "workspace_members"]);
const CreateTeamspaceInput = z.strictObject({
  accessMode: TeamspaceAccessMode,
  description: z.string().trim().max(2000).nullable().optional(),
  exportEnabled: z.boolean().optional(),
  guestsEnabled: z.boolean().optional(),
  icon: z.unknown().optional(),
  name: z.string().trim().min(1).max(120),
});
const UpdateTeamspaceInput = z
  .strictObject({
    accessMode: TeamspaceAccessMode.optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    icon: z.unknown().optional(),
    invitePolicy: InvitePolicy.optional(),
    memberAccessLevel: MemberAccessLevel.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    publicSharingEnabled: z.boolean().optional(),
    sidebarEditPolicy: SidebarEditPolicy.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Provide a field to update.");
const AddPrincipalInput = z.strictObject({
  accessLevelOverride: MemberAccessLevel.nullable().optional(),
  principalType: PrincipalType.optional(),
  role: TeamspaceRole,
  userId: z.string().min(1),
});
const UpdatePrincipalInput = z.strictObject({
  accessLevelOverride: MemberAccessLevel.nullable().optional(),
  role: TeamspaceRole,
});
const UpdateTeamspaceSettingsInput = z.strictObject({
  creationPolicy: CreationPolicy,
});
const UpdateTeamspaceDefaultsInput = z.strictObject({
  defaultTeamspaceIds: z.array(z.string().min(1)).min(1),
});
const UpdateInviteLinkInput = z.strictObject({
  enabled: z.boolean(),
});
export type GetTeamspaceSettingsOperationInput = { workspaceId: string };
export async function getTeamspaceSettingsOperation(
  context: ServerOperationContext,
  operationInput: GetTeamspaceSettingsOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const service = teamspaceService(context);
  const userId = requireOperationActor(context).id;
  const workspaceId = operationInput.workspaceId;
  return service.getWorkspaceSettings(workspaceId, userId);
}

export type UpdateTeamspaceSettingsOperationInput = { workspaceId: string; body?: unknown };
export async function updateTeamspaceSettingsOperation(
  context: ServerOperationContext,
  operationInput: UpdateTeamspaceSettingsOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const parsed = await parseOperationBody(UpdateTeamspaceSettingsInput, readBody);
  if (!parsed.ok) return deny({ error: parsed.message }, 400);
  const service = teamspaceService(context);
  const userId = requireOperationActor(context).id;
  const workspaceId = operationInput.workspaceId;
  return service.updateWorkspaceSettings({ ...parsed.data, userId, workspaceId });
}

export type UpdateTeamspaceDefaultsOperationInput = { workspaceId: string; body?: unknown };
export async function updateTeamspaceDefaultsOperation(
  context: ServerOperationContext,
  operationInput: UpdateTeamspaceDefaultsOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const parsed = await parseOperationBody(UpdateTeamspaceDefaultsInput, readBody);
  if (!parsed.ok) return deny({ error: parsed.message }, 400);
  const service = teamspaceService(context);
  const userId = requireOperationActor(context).id;
  const workspaceId = operationInput.workspaceId;
  return service.updateDefaults({
    defaultTeamspaceIds: [...parsed.data.defaultTeamspaceIds],
    userId,
    workspaceId,
  });
}

export type ListTeamspacesOperationInput = { workspaceId: string; status?: string };
export async function listTeamspacesOperation(
  context: ServerOperationContext,
  operationInput: ListTeamspacesOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const service = teamspaceService(context);
  const userId = requireOperationActor(context).id;
  const workspaceId = operationInput.workspaceId;
  return {
    teamspaces: await service.list({
      includeArchived: operationInput.status === "archived",
      userId,
      workspaceId,
    }),
  };
}

export type CreateTeamspaceOperationInput = { workspaceId: string; body?: unknown };
export async function createTeamspaceOperation(
  context: ServerOperationContext,
  operationInput: CreateTeamspaceOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const parsed = await parseOperationBody(CreateTeamspaceInput, readBody);
  if (!parsed.ok) return deny({ error: parsed.message }, 400);
  const service = teamspaceService(context);
  const userId = requireOperationActor(context).id;
  const workspaceId = operationInput.workspaceId;
  return service.create({ ...parsed.data, userId, workspaceId });
}

export type GetTeamspaceOperationInput = { workspaceId: string; teamspaceId: string };
export async function getTeamspaceOperation(
  context: ServerOperationContext,
  operationInput: GetTeamspaceOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const service = teamspaceService(context);
  const userId = requireOperationActor(context).id;
  const workspaceId = operationInput.workspaceId;
  return service.get({
    teamspaceId: operationInput.teamspaceId,
    userId,
    workspaceId,
  });
}

export type UpdateTeamspaceOperationInput = {
  workspaceId: string;
  teamspaceId: string;
  body?: unknown;
};
export async function updateTeamspaceOperation(
  context: ServerOperationContext,
  operationInput: UpdateTeamspaceOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const parsed = await parseOperationBody(UpdateTeamspaceInput, readBody);
  if (!parsed.ok) return deny({ error: parsed.message }, 400);
  const service = teamspaceService(context);
  const userId = requireOperationActor(context).id;
  const workspaceId = operationInput.workspaceId;
  return service.update({
    ...parsed.data,
    teamspaceId: operationInput.teamspaceId,
    userId,
    workspaceId,
  });
}

export type SetTeamspaceMembershipOperationInput = {
  action: "join" | "leave";
  workspaceId: string;
  teamspaceId: string;
};
export async function setTeamspaceMembershipOperation(
  context: ServerOperationContext,
  operationInput: SetTeamspaceMembershipOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const service = teamspaceService(context);
  const userId = requireOperationActor(context).id;
  const workspaceId = operationInput.workspaceId;
  return service[operationInput.action]({
    teamspaceId: operationInput.teamspaceId,
    userId,
    workspaceId,
  });
}

export type TeamspaceLifecycleOperationInput = {
  action: "archive" | "restore" | "recover-owner";
  workspaceId: string;
  teamspaceId: string;
};
export async function teamspaceLifecycleOperation(
  context: ServerOperationContext,
  operationInput: TeamspaceLifecycleOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const service = teamspaceService(context);
  const userId = requireOperationActor(context).id;
  const workspaceId = operationInput.workspaceId;
  return service[
    operationInput.action === "recover-owner" ? "recoverOwner" : operationInput.action
  ]({
    teamspaceId: operationInput.teamspaceId,
    userId,
    workspaceId,
  });
}

export type UpdateTeamspaceInviteLinkOperationInput = {
  workspaceId: string;
  teamspaceId: string;
  body?: unknown;
};
export async function updateTeamspaceInviteLinkOperation(
  context: ServerOperationContext,
  operationInput: UpdateTeamspaceInviteLinkOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const parsed = await parseOperationBody(UpdateInviteLinkInput, readBody);
  if (!parsed.ok) return deny({ error: parsed.message }, 400);
  const service = teamspaceService(context);
  const userId = requireOperationActor(context).id;
  const workspaceId = operationInput.workspaceId;
  return service.updateInviteLink({
    enabled: parsed.data.enabled,
    teamspaceId: operationInput.teamspaceId,
    userId,
    workspaceId,
  });
}

export type AcceptTeamspaceInviteOperationInput = { workspaceId: string; token: string };
export async function acceptTeamspaceInviteOperation(
  context: ServerOperationContext,
  operationInput: AcceptTeamspaceInviteOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const service = teamspaceService(context);
  const userId = requireOperationActor(context).id;
  const workspaceId = operationInput.workspaceId;
  return service.acceptInvite({
    token: operationInput.token,
    userId,
    workspaceId,
  });
}

export type ListTeamspacePrincipalsOperationInput = { workspaceId: string; teamspaceId: string };
export async function listTeamspacePrincipalsOperation(
  context: ServerOperationContext,
  operationInput: ListTeamspacePrincipalsOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const service = teamspaceService(context);
  const userId = requireOperationActor(context).id;
  const workspaceId = operationInput.workspaceId;
  return {
    principals: await service.listPrincipals({
      teamspaceId: operationInput.teamspaceId,
      userId,
      workspaceId,
    }),
  };
}

export type AddTeamspacePrincipalOperationInput = {
  workspaceId: string;
  teamspaceId: string;
  body?: unknown;
};
export async function addTeamspacePrincipalOperation(
  context: ServerOperationContext,
  operationInput: AddTeamspacePrincipalOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const parsed = await parseOperationBody(AddPrincipalInput, readBody);
  if (!parsed.ok) return deny({ error: parsed.message }, 400);
  const service = teamspaceService(context);
  const userId = requireOperationActor(context).id;
  const workspaceId = operationInput.workspaceId;
  return service.addPrincipal({
    role: parsed.data.role,
    accessLevelOverride: parsed.data.accessLevelOverride,
    principalType: parsed.data.principalType ?? "user",
    targetUserId: parsed.data.userId,
    teamspaceId: operationInput.teamspaceId,
    userId,
    workspaceId,
  });
}

export type UpdateTeamspacePrincipalOperationInput = {
  workspaceId: string;
  principalId: string;
  teamspaceId: string;
  body?: unknown;
};
export async function updateTeamspacePrincipalOperation(
  context: ServerOperationContext,
  operationInput: UpdateTeamspacePrincipalOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const parsed = await parseOperationBody(UpdatePrincipalInput, readBody);
  if (!parsed.ok) return deny({ error: parsed.message }, 400);
  const service = teamspaceService(context);
  const userId = requireOperationActor(context).id;
  const workspaceId = operationInput.workspaceId;
  return service.updatePrincipal({
    principalId: operationInput.principalId,
    role: parsed.data.role,
    accessLevelOverride: parsed.data.accessLevelOverride,
    teamspaceId: operationInput.teamspaceId,
    userId,
    workspaceId,
  });
}

export type RemoveTeamspacePrincipalOperationInput = {
  workspaceId: string;
  principalId: string;
  teamspaceId: string;
};
export async function removeTeamspacePrincipalOperation(
  context: ServerOperationContext,
  operationInput: RemoveTeamspacePrincipalOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const service = teamspaceService(context);
  const userId = requireOperationActor(context).id;
  const workspaceId = operationInput.workspaceId;
  return service.removePrincipal({
    principalId: operationInput.principalId,
    teamspaceId: operationInput.teamspaceId,
    userId,
    workspaceId,
  });
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}

function teamspaceService(context: ServerOperationContext) {
  return new TeamspaceManagementService(
    undefined,
    context.editionExtension ?? undefined,
    context.env,
  );
}
