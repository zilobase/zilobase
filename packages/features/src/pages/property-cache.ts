import { z } from "zod";
import type { QueryClient } from "@tanstack/react-query";
import { sharedClient, type SharedClient } from "../data/client";
import type { PagePropertiesPayload } from "./contracts";
import { propertyCacheEntitySchema } from "../databases/schema/cache-entities";
import { valueIdentity, valueCacheEntitySchema } from "../databases/schema/cache-entities";
import { pagePropertyValueEntitySchema } from "../databases/core/entities";
import type { PageDetailReference } from "./cache";

const payloadSchema = z
  .object({
    workspaceId: z.string().min(1),
    properties: z.array(propertyCacheEntitySchema),
    values: z.array(pagePropertyValueEntitySchema),
    databaseIds: z.array(z.string()).optional(),
    databaseVersions: z.record(z.string(), z.number().int().nonnegative()).optional(),
    presenceTargets: z
      .array(
        z
          .object({
            databaseId: z.string(),
            dataSourceId: z.string(),
            propertyIds: z.array(z.string()),
            rowId: z.string(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
export type PagePropertiesReference = Omit<PagePropertiesPayload, "properties" | "values"> & {
  cacheId: string;
  propertyIds: string[];
  pageId: string;
  valuePropertyIds: string[];
};

export function normalizePageProperties(
  client: QueryClient,
  read: ReturnType<SharedClient["capture"]>,
  pageId: string,
  input: unknown,
): PagePropertiesReference {
  const payload = payloadSchema.parse(input);
  if (payload.properties.some((property) => property.workspaceId !== payload.workspaceId))
    throw new Error("Page property workspace mismatch");
  if (payload.values.some((value) => value.pageId !== pageId))
    throw new Error("Page property value identity mismatch");
  const detail = client.getQueryData<PageDetailReference>(["page", pageId]);
  const owner = detail ? sharedClient(client).get(detail.page.cacheId) : undefined;
  const entities = owner ?? sharedClient(client).resolve(read, payload.workspaceId);
  // Captured identity is checked even when the detail already has a scoped owner.
  if (sharedClient(client).capture().key !== read.key)
    throw new Error("Expired page properties read");
  if (entities.session.scope.workspaceId !== payload.workspaceId)
    throw new Error("Page property scope mismatch");
  entities.session.ingest([
    entities.databases.definitions.stage(payload.properties),
    entities.databases.values.stage(
      payload.values.map((value) => ({
        ...value,
        valueId: value.id,
        id: valueIdentity(value.pageId, value.propertyId),
      })),
    ),
  ]);
  entities.databases.admitPageProperties(pageId, payload.presenceTargets ?? []);
  const { properties, values, ...context } = payload;
  return {
    ...context,
    cacheId: entities.session.id,
    pageId,
    propertyIds: properties.map(({ id }) => id),
    valuePropertyIds: values.map((value) => value.propertyId),
  };
}

export function resolvePageProperties(
  client: QueryClient,
  reference: PagePropertiesReference | undefined,
): PagePropertiesPayload | undefined {
  if (!reference) return undefined;
  const owner = sharedClient(client).get(reference.cacheId);
  if (!owner) return undefined;
  const { cacheId: _cacheId, propertyIds, pageId, valuePropertyIds, ...context } = reference;
  return {
    ...context,
    values: [...new Set([...propertyIds, ...valuePropertyIds])].flatMap((propertyId) => {
      const value = owner.databases.values.get(valueIdentity(pageId, propertyId));
      if (!value) return [];
      const { valueId, ...fields } = valueCacheEntitySchema.strip().parse(value);
      return [{ ...fields, id: valueId }];
    }),
    properties: propertyIds.flatMap((id) => {
      const property = owner.databases.definitions.get(id);
      return property && !property.deletedAt
        ? [
            {
              ...propertyCacheEntitySchema.strip().parse(property),
              createdAt: property.createdAt ?? property.updatedAt,
            },
          ]
        : [];
    }),
  };
}
