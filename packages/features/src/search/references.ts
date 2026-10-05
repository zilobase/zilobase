import { getDatabaseEmoji } from "../databases/views/appearance";
import { z } from "zod";
import type { QueryClient } from "@tanstack/react-query";
import { sharedClient, type SharedClient } from "../data/client";
import { pageCacheEntitySchema } from "../pages/cache-entities";
import { hostCacheEntitySchema } from "../databases/schema/cache-entities";
import type { AppSearchResult } from "./contracts";

const resultSchema = z.object({
  id: z.string().min(1),
  path: z.string(),
  title: z.string(),
  type: z.enum(["page", "database"]),
  emoji: z.string().nullable(),
  excerpt: z.string().nullable().optional(),
  entity: z.unknown(),
});
export type SearchReference = Omit<AppSearchResult, "title" | "emoji"> & {
  cacheId: string;
  excerpt?: string | null;
};
export function normalizeSearchReferences(
  client: QueryClient,
  read: ReturnType<SharedClient["capture"]>,
  workspaceId: string,
  input: unknown,
): SearchReference[] {
  const results = z.array(resultSchema).parse(input);
  const owner = sharedClient(client).resolve(read, workspaceId);
  const prepared = results.map((result) => {
    const entity =
      result.type === "page"
        ? pageCacheEntitySchema.strip().parse(result.entity)
        : hostCacheEntitySchema.strip().parse(result.entity);
    if (entity.id !== result.id || entity.workspaceId !== workspaceId)
      throw new Error("Search entity scope mismatch");
    return {
      result,
      stage:
        result.type === "page"
          ? owner.pages.stage([pageCacheEntitySchema.parse(entity)])
          : owner.databases.hosts.stage([hostCacheEntitySchema.parse(entity)]),
    };
  });
  owner.session.ingest(prepared.map(({ stage }) => stage));
  return prepared.map(
    ({ result: { title: _title, emoji: _emoji, entity: _entity, ...context } }) => ({
      ...context,
      cacheId: owner.session.id,
    }),
  );
}
export function resolveSearchReferences(
  client: QueryClient,
  references: SearchReference[],
): AppSearchResult[] {
  return references.flatMap((reference) => {
    const owner = sharedClient(client).get(reference.cacheId);
    const entity =
      reference.type === "page"
        ? owner?.pages.get(reference.id)
        : owner?.databases.hosts.get(reference.id);
    if (!entity) return [];
    const metadata = reference.type === "page" && "metadata" in entity ? entity.metadata : null;
    const emoji =
      reference.type === "database" && "config" in entity
        ? getDatabaseEmoji(entity)
        : metadata && typeof metadata.emoji === "string"
          ? metadata.emoji
          : null;
    return [{ ...reference, title: entity.name, emoji }];
  });
}
