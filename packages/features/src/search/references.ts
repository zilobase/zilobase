import { contentVerificationSchema } from "./controls";
import { getDatabaseEmoji } from "../databases/views/appearance";
import { z } from "zod";
import type { QueryClient } from "@tanstack/react-query";
import { sharedClient, type SharedClient } from "../data/client";
import { pageCacheEntitySchema } from "../pages/cache-registration";
import { hostCacheEntitySchema, sourceCacheEntitySchema } from "../databases/schema/cache-entities";
import type { AppSearchResult } from "./contracts";

const resultSchema = z.object({
  id: z.string().min(1),
  path: z.string(),
  title: z.string(),
  type: z.enum(["page", "database"]),
  emoji: z.string().nullable(),
  excerpt: z.string().nullable().optional(),
  match: z
    .object({
      chunkId: z.string(),
      pageId: z.string(),
      kind: z.enum(["title", "body", "property"]),
      headingPath: z.array(z.string()),
      blockId: z.string().optional(),
      blockIndex: z.number().int().nonnegative().optional(),
      propertyId: z.string().optional(),
      databaseId: z.string().optional(),
      dataSourceId: z.string().optional(),
      recordId: z.string().optional(),
    })
    .optional(),
  createdAt: z.string().optional(),
  createdById: z.string().nullable().optional(),
  lastEditedAt: z.string().optional(),
  lastEditedById: z.string().nullable().optional(),
  verification: contentVerificationSchema.optional(),
  entity: z.unknown(),
  titleSource: z.unknown().optional(),
});
export type SearchReference = Omit<AppSearchResult, "title" | "emoji"> & {
  cacheId: string;
  titleSourceId?: string | null;
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
    const titleSource =
      result.type === "database" && result.titleSource
        ? sourceCacheEntitySchema.strip().parse(result.titleSource)
        : null;
    if (titleSource && titleSource.workspaceId !== workspaceId)
      throw new Error("Search source scope mismatch");
    return {
      result,
      titleSourceId: titleSource?.id ?? null,
      sourceStage: titleSource ? owner.databases.sources.stage([titleSource]) : null,
      stage:
        result.type === "page"
          ? owner.pages.stage([pageCacheEntitySchema.parse(entity)])
          : owner.databases.hosts.stage([hostCacheEntitySchema.parse(entity)]),
    };
  });
  owner.session.ingest(
    prepared.flatMap(({ stage, sourceStage }) => [stage, ...(sourceStage ? [sourceStage] : [])]),
  );
  return prepared.map(
    ({
      result: { title: _title, emoji: _emoji, entity: _entity, titleSource: _source, ...context },
      titleSourceId,
    }) => ({
      ...context,
      cacheId: owner.session.id,
      titleSourceId,
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
    const titleSource =
      reference.type === "database" && reference.titleSourceId
        ? owner?.databases.sources.get(reference.titleSourceId)
        : null;
    const metadata = reference.type === "page" && "metadata" in entity ? entity.metadata : null;
    const emoji =
      reference.type === "database" && "config" in entity
        ? getDatabaseEmoji(titleSource ?? entity)
        : metadata && typeof metadata.emoji === "string"
          ? metadata.emoji
          : null;
    return [{ ...reference, title: titleSource?.name ?? entity.name, emoji }];
  });
}
