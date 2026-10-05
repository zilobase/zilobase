import { z } from "zod";

export const propertyCacheEntitySchema = z
  .object({
    id: z.string().min(1),
    workspaceId: z.string().min(1),
    name: z.string(),
    type: z.string().min(1),
    updatedAt: z.string().datetime({ offset: true }),
    config: z.unknown().optional(),
    deletedAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export type PropertyCacheEntity = z.infer<typeof propertyCacheEntitySchema>;
