import { z } from "zod";
import {
  databaseHostEntitySchema,
  databasePropertyEntitySchema,
  databaseRecordEntitySchema,
  databaseViewEntitySchema,
  dataSourceEntitySchema,
  pagePropertyValueEntitySchema,
} from "../core/entities";

export const propertyCacheEntitySchema = z
  .object({
    id: z.string().min(1),
    workspaceId: z.string().min(1),
    name: z.string(),
    type: z.string().min(1),
    updatedAt: z.string().datetime({ offset: true }),
    createdAt: z.string().datetime({ offset: true }).optional(),
    config: z.unknown().optional(),
    deletedAt: z.string().datetime({ offset: true }).nullable().optional(),
    deletedById: z.string().nullable().optional(),
  })
  .strict();

export type PropertyCacheEntity = z.infer<typeof propertyCacheEntitySchema>;

export const hostCacheEntitySchema = databaseHostEntitySchema.omit({ accessLevel: true }).extend({
  createdById: z.string().nullable().optional(),
  deletedById: z.string().nullable().optional(),
  teamspaceId: z.string().nullable().optional(),
});
export const sourceCacheEntitySchema = dataSourceEntitySchema.omit({
  position: true,
  linkedAt: true,
});
export const sourceLinkCacheEntitySchema = z
  .object({
    id: z.string(),
    databaseId: z.string(),
    dataSourceId: z.string(),
    position: z.number().int().nonnegative(),
    linkedAt: z.string().datetime({ offset: true }).nullable(),
    hostVersion: z.number().int().nonnegative(),
  })
  .strict();
export const bindingCacheEntitySchema = databasePropertyEntitySchema.omit({ property: true });
export const valueCacheEntitySchema = pagePropertyValueEntitySchema.extend({ valueId: z.string() });
export const recordCacheEntitySchema = databaseRecordEntitySchema
  .omit({ page: true, valuesByPropertyId: true })
  .extend({
    valueIds: z.array(z.string()),
  });
export const viewCacheEntitySchema = databaseViewEntitySchema.extend({
  hostVersion: z.number().int().nonnegative(),
});

export function valueIdentity(pageId: string, propertyId: string) {
  return JSON.stringify([pageId, propertyId]);
}
export function sourceLinkIdentity(databaseId: string, dataSourceId: string) {
  return JSON.stringify([databaseId, dataSourceId]);
}
