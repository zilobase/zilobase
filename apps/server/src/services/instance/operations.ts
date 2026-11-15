import { z } from "zod";
import { isCommunityRegistration } from "../../shared/config/app-policy";
import { parseOperationBody } from "../../shared/validation";
import { getMembership } from "../access/principal-access";
import {
  requireOperationPolicy,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import {
  canManageInstanceSettings,
  getInstanceAdministrationSettings,
  updateInstanceAdministrationSettings,
} from "./settings/administration";
const InstanceSettingsUpdate = z
  .object({
    displayName: z.string().trim().min(1).max(100).optional(),
    registrationMode: z.enum(["invite-only", "open"]).optional(),
  })
  .refine(
    (value) => value.displayName !== undefined || value.registrationMode !== undefined,
    "Provide at least one setting to update.",
  );
async function requireSelfHostedOwner(context: ServerOperationContext) {
  if (!isCommunityRegistration(context.policy)) {
    return deny({ error: "Not found" }, 404);
  }
  const requestUser = context.authentication.user;
  if (!requestUser || context.authentication.authMethod !== "session") {
    return deny({ error: "Unauthorized" }, 401);
  }
  const settings = await getInstanceAdministrationSettings(context.env);
  if (!settings.pinnedWorkspaceId) {
    return deny({ error: "Instance bootstrap is incomplete." }, 409);
  }
  const membership = await getMembership(settings.pinnedWorkspaceId, requestUser.id);
  if (!canManageInstanceSettings(membership?.role)) {
    return deny(
      {
        error: "Only the self-hosted instance owner can change server settings.",
      },
      403,
    );
  }
  return { settings };
}

export type GetInstanceSettingsOperationInput = {};
export async function getInstanceSettingsOperation(
  context: ServerOperationContext,
  _input: GetInstanceSettingsOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });

  const access = await requireSelfHostedOwner(context);
  return { settings: access.settings };
}

export type UpdateInstanceSettingsOperationInput = { body?: unknown };
export async function updateInstanceSettingsOperation(
  context: ServerOperationContext,
  operationInput: UpdateInstanceSettingsOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });

  const access = await requireSelfHostedOwner(context);
  const parsed = await parseOperationBody(InstanceSettingsUpdate, readBody);
  if (!parsed.ok) {
    return deny({ error: parsed.message || "Invalid settings request." }, 400);
  }
  const settings = await updateInstanceAdministrationSettings(parsed.data);
  return { settings: { ...access.settings, ...settings } };
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
