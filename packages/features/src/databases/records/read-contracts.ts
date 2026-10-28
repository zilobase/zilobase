import { z } from "zod";

export const recordFilterSchema = z
  .object({
    propertyId: z.string().min(1).max(128),
    operator: z.enum([
      "eq",
      "neq",
      "contains",
      "gt",
      "gte",
      "lt",
      "lte",
      "is_empty",
      "is_not_empty",
    ]),
    value: z.union([z.string().max(512), z.number().finite(), z.boolean()]).nullable(),
  })
  .strict();

/** Explicit source queries do not inherit the host's active view configuration. */
export const sourceRecordQuerySchema = z
  .object({
    databaseId: z.string().min(1).max(128),
    dataSourceId: z.string().min(1).max(128),
    propertyIds: z.array(z.string().min(1).max(128)).max(20).default([]),
    filters: z.array(recordFilterSchema).max(10).default([]),
    nameContains: z.string().max(512).default(""),
    sort: z.enum(["id", "name", "createdAt", "updatedAt"]).default("id"),
    sortPropertyId: z
      .string()
      .min(1)
      .max(128)
      .nullable()
      .default(null)
      .describe(
        "Sort by this source property instead of the built-in sort. Scalar properties only; missing values sort last.",
      ),
    direction: z.enum(["asc", "desc"]).default("asc"),
    limit: z.number().int().min(1).max(100).default(50),
    recordId: z.string().min(1).max(128).optional(),
  })
  .strict();
export type SourceRecordQuery = z.infer<typeof sourceRecordQuerySchema>;
export type SourceRecordPosition = { id: string; value: string | null };
export type SourceReadRevision = { database: number; source: number };
