import { z } from "zod";
import { getCanonicalApiOrigin } from "../../shared/config/config";
import { parseOperationBody } from "../../shared/validation";
import { getMembership } from "../access/principal-access";
import {
  requireOperationPolicy,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import { readApiKeyWorkspaceId } from "./api-keys";
import {
  createOwnedApiKey,
  deleteOwnedApiKey,
  getOwnedApiKey,
  listOwnedApiKeys,
  readMetadata,
  toApiKeyPayload,
  updateOwnedApiKey,
} from "./lifecycle";
const trimmedName = z.string().trim().min(1).max(80);
const CreateApiKey = z.object({
  expiresIn: z.int().positive().nullable().optional(),
  name: trimmedName,
  workspaceId: z.string().trim().min(1),
});
const UpdateApiKey = z
  .object({
    enabled: z.boolean().optional(),
    name: trimmedName.optional(),
  })
  .refine(
    (value) => value.enabled !== undefined || value.name !== undefined,
    "At least one field is required",
  );
async function requireSessionUser(context: ServerOperationContext) {
  const requestUser = context.authentication.user;
  if (!requestUser) {
    return deny({ error: "Unauthorized" }, 401);
  }
  if (context.authentication.authMethod === "apiKey") {
    return deny({ error: "API keys cannot manage API keys" }, 403);
  }
  return { user: requestUser };
}

export type ListApiKeysOperationInput = { workspaceId?: string };
export async function listApiKeysOperation(
  context: ServerOperationContext,
  operationInput: ListApiKeysOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });

  const auth = await requireSessionUser(context);
  const workspaceId = operationInput.workspaceId?.trim();
  if (!workspaceId) {
    return deny({ error: "workspaceId is required" }, 400);
  }
  if (!(await getMembership(workspaceId, auth.user.id))) {
    return deny({ error: "Forbidden" }, 403);
  }
  const rows = await listOwnedApiKeys(auth.user.id);
  return {
    keys: rows
      .filter((row) => readApiKeyWorkspaceId(readMetadata(row.metadata)) === workspaceId)
      .map(toApiKeyPayload),
  };
}

export type CreateApiKeyOperationInput = { body?: unknown };
export async function createApiKeyOperation(
  context: ServerOperationContext,
  operationInput: CreateApiKeyOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });

  const authContext = await requireSessionUser(context);
  const parsed = await parseOperationBody(CreateApiKey, readBody);
  if (!parsed.ok) {
    return deny(
      {
        error: "Invalid API key input",
        message: parsed.message || "Invalid API key input",
      },
      400,
    );
  }
  if (!(await getMembership(parsed.data.workspaceId, authContext.user.id))) {
    return deny({ error: "Forbidden" }, 403);
  }
  const key = await createOwnedApiKey(
    parsed.data,
    authContext.user.id,
    context.env,
    context.request ?? new Request(getCanonicalApiOrigin(context.env)),
    {
      editionExtension: context.editionExtension ?? undefined,
      policy: context.policy,
    },
  );
  if ("error" in key) {
    return deny(
      {
        error: "Invalid API key input",
        message: key.error,
      },
      400,
    );
  }
  return { key: { ...toApiKeyPayload(key), key: key.key } };
}

export type UpdateApiKeyOperationInput = { id: string; body?: unknown };
export async function updateApiKeyOperation(
  context: ServerOperationContext,
  operationInput: UpdateApiKeyOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });

  const auth = await requireSessionUser(context);
  const existing = await getOwnedApiKey(operationInput.id, auth.user.id);
  if (!existing) {
    return deny({ error: "API key not found" }, 404);
  }
  const workspaceId = readApiKeyWorkspaceId(readMetadata(existing.metadata));
  if (!workspaceId || !(await getMembership(workspaceId, auth.user.id))) {
    return deny({ error: "Forbidden" }, 403);
  }
  const parsed = await parseOperationBody(UpdateApiKey, readBody);
  if (!parsed.ok) {
    return deny(
      {
        error: "Invalid API key input",
        message: parsed.message || "Invalid API key input",
      },
      400,
    );
  }
  const updated = await updateOwnedApiKey(existing.id, auth.user.id, parsed.data);
  return { key: toApiKeyPayload(updated) };
}

export type DeleteApiKeyOperationInput = { id: string };
export async function deleteApiKeyOperation(
  context: ServerOperationContext,
  operationInput: DeleteApiKeyOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });

  const auth = await requireSessionUser(context);
  const existing = await getOwnedApiKey(operationInput.id, auth.user.id);
  if (!existing) {
    return deny({ error: "API key not found" }, 404);
  }
  const workspaceId = readApiKeyWorkspaceId(readMetadata(existing.metadata));
  if (!workspaceId || !(await getMembership(workspaceId, auth.user.id))) {
    return deny({ error: "Forbidden" }, 403);
  }
  await deleteOwnedApiKey(existing.id, auth.user.id);
  return { deleted: true };
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
