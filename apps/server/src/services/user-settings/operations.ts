import { z } from "zod";
import { parseOperationBody, parseUnknown } from "../../shared/validation";
import {
  requireOperationPolicy,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import { getOrCreateUserSettings, updateUserPreferences } from "./preferences/preferences";
import { updateUserProfile } from "./profile/profile";
const UpdateProfile = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
      .optional(),
    name: z.string().trim().min(1, "Name is required.").max(120).optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.email !== undefined,
    "Provide at least one field to update.",
  );
const UpdateUserSettings = z.object({
  embeddedItemsOpenAs: z.enum(["dialog", "sidepanel"]).optional(),
  pageFullWidth: z.boolean().optional(),
  sidebarConfig: z
    .unknown()
    .refine(
      (value) => typeof value === "object" && value !== null && !Array.isArray(value),
      "sidebarConfig must be an object",
    )
    .optional(),
  aiInstructionPage: z
    .object({
      workspaceId: z.string().min(1).max(128),
      pageId: z.string().min(1).max(128).nullable(),
    })
    .strict()
    .optional(),
});
export type GetUserSettingsOperationInput = {};
export async function getUserSettingsOperation(
  context: ServerOperationContext,
  operationInput: GetUserSettingsOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });

  const user = context.authentication.user;
  if (!user) {
    return deny({ error: "Unauthorized" }, 401);
  }
  return { settings: await getOrCreateUserSettings(user.id) };
}

export type UpdateUserSettingsOperationInput = { body?: unknown };
export async function updateUserSettingsOperation(
  context: ServerOperationContext,
  operationInput: UpdateUserSettingsOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });

  const user = context.authentication.user;
  if (!user) {
    return deny({ error: "Unauthorized" }, 401);
  }
  const body = await readBody().catch(() => null);
  if (!body || typeof body !== "object") {
    return deny({ error: "A JSON body is required" }, 400);
  }
  const parsed = await parseUnknown(UpdateUserSettings, body);
  if (!parsed.ok) {
    return deny({ error: parsed.message }, 400);
  }
  return { settings: await updateUserPreferences(user.id, parsed.data) };
}

export type UpdateUserProfileOperationInput = { body?: unknown };
export async function updateUserProfileOperation(
  context: ServerOperationContext,
  operationInput: UpdateUserProfileOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });

  const currentUser = context.authentication.user;
  if (!currentUser) {
    return deny({ error: "Unauthorized" }, 401);
  }
  const parsed = await parseOperationBody(UpdateProfile, readBody);
  if (!parsed.ok) {
    return deny({ error: parsed.message || "Invalid request." }, 400);
  }
  const result = await updateUserProfile(currentUser, parsed.data);
  if ("conflict" in result) return deny({ error: "That email address is already in use." }, 409);
  return result;
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
