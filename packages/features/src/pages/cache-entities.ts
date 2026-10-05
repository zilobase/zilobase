import { z } from "zod";

/** Partial authorized reads may know metadata before richer page fields arrive. */
export const pageCacheEntitySchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    updatedAt: z.string().datetime({ offset: true }),
    workspaceId: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    deletedAt: z.string().datetime({ offset: true }).nullable().optional(),
    hasContent: z.boolean().optional(),
  })
  .strict();

export type PageCacheEntity = z.infer<typeof pageCacheEntitySchema>;
