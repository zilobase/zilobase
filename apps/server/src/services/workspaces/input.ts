import { z } from "zod";

export const IsoDateTimeString = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
    "Invalid date-time format",
  );

export const MemberInvitationInput = z.strictObject({
  accessExpiresAt: IsoDateTimeString.nullable().optional(),
  email: z
    .string()
    .trim()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email"),
  role: z.enum(["admin", "member", "temporary"]),
});

export const MemberUpdateInput = z.strictObject({
  accessExpiresAt: IsoDateTimeString.nullable().optional(),
  role: z.enum(["owner", "admin", "member", "temporary"]),
});

export const trimmedLogo = z
  .string()
  .trim()
  .refine((value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }, "Enter a valid logo URL.");

export const UpdateWorkspaceInput = z
  .object({
    logo: z.union([trimmedLogo, z.literal(""), z.null()]).optional(),
    metadata: z.union([z.string().trim().max(5000), z.literal(""), z.null()]).optional(),
    name: z.string().trim().min(1, "Workspace name is required.").max(120).optional(),
    slug: z
      .string()
      .trim()
      .min(1, "Slug is required.")
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only.")
      .optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.slug !== undefined ||
      value.logo !== undefined ||
      value.metadata !== undefined,
    "Provide at least one field to update.",
  );

export const DeleteWorkspaceInput = z.strictObject({
  confirmationName: z.string(),
});
