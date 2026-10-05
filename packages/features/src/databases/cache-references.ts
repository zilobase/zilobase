import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { sharedClient, type SharedClient } from "../data/client";
import {
  databaseBootstrapResponseSchema,
  databasePropertyEntitySchema,
  pagePropertyEntitySchema,
  type DatabaseBootstrapResponse,
} from "./core/entities";
import { bindingCacheEntitySchema } from "./schema/cache-entities";

// Other bootstrap families migrate in Pass 7; definitions/bindings already have
// one owner. Ordered memberships belong to the authorized result.
export const databaseBootstrapReferenceSchema = databaseBootstrapResponseSchema
  .omit({ properties: true })
  .extend({ cacheId: z.string(), bindingIds: z.array(z.string()) })
  .strict();
export type DatabaseBootstrapReference = z.infer<typeof databaseBootstrapReferenceSchema>;

export function normalizeDatabaseBootstrap(
  client: QueryClient,
  read: ReturnType<SharedClient["capture"]>,
  databaseId: string,
  input: unknown,
): DatabaseBootstrapReference {
  const incoming = databaseBootstrapResponseSchema.parse(input);
  const owner = sharedClient(client).resolve(
    read,
    incoming.database.workspaceId,
    read.identity.viewer.kind === "public" ? { kind: "public", id: databaseId } : undefined,
  );
  const result = owner.databases.ingestBootstrap(databaseId, incoming);
  const { properties: _properties, ...context } = incoming;
  return { ...context, cacheId: owner.session.id, bindingIds: result.bindingIds };
}

export function resolveDatabaseBootstrap(
  client: QueryClient,
  input: unknown,
): DatabaseBootstrapResponse | undefined {
  const parsed = databaseBootstrapReferenceSchema.safeParse(input);
  if (!parsed.success) return undefined;
  const owner = sharedClient(client).get(parsed.data.cacheId);
  if (!owner) return undefined;
  const { cacheId: _cacheId, bindingIds, ...context } = parsed.data;
  const properties = bindingIds.flatMap((id) => {
    const binding = owner.databases.bindings.get(id);
    const definition = binding && owner.databases.definitions.get(binding.propertyId);
    if (!binding || !definition || definition.deletedAt) return [];
    return [
      databasePropertyEntitySchema.parse({
        ...bindingCacheEntitySchema.strip().parse(binding),
        property: pagePropertyEntitySchema.strip().parse(definition),
      }),
    ];
  });
  return { ...context, properties };
}
