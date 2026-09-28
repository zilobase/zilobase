import { z } from "zod";

const id = z.string().trim().min(1).max(128);
export const databaseCreationCommandSchema = z
  .object({
    type: z.literal("database.create"),
    workspaceId: id,
    pageId: id.optional(),
    name: z.string(),
    standalone: z.boolean(),
    teamspaceId: id.nullable().optional(),
  })
  .strict()
  .refine((input) => input.standalone || !!input.pageId, "Parent page is required");

export const databaseLifecycleCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("database.archive") }).strict(),
  z.object({ type: z.literal("database.restore") }).strict(),
  z.object({ type: z.literal("database.favorite"), favorite: z.boolean() }).strict(),
  z
    .object({
      type: z.literal("access.upsert"),
      targetId: id,
      targetType: z.enum(["public", "user", "team", "agent"]),
      accessLevel: z.enum(["view", "edit", "full"]),
    })
    .strict()
    .refine(
      (input) =>
        input.targetType !== "public" || (input.targetId === "*" && input.accessLevel === "view"),
      "Invalid public access",
    )
    .refine(
      (input) => input.targetType !== "agent" || input.accessLevel !== "full",
      "Invalid agent access",
    ),
  z.object({ type: z.literal("access.remove"), ruleId: id }).strict(),
  z.object({ type: z.literal("database.publish"), published: z.boolean() }).strict(),
]);
export type DatabaseCreationCommand = z.infer<typeof databaseCreationCommandSchema>;
export type DatabaseLifecycleCommand = z.infer<typeof databaseLifecycleCommandSchema>;

export type DatabaseOperationStatus = "queued" | "saving" | "unconfirmed" | "committed";
