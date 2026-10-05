import { z } from "zod";
import type { QueryClient } from "@tanstack/react-query";
import { sharedClient, type SharedClient } from "../data/client";
import { pageCacheEntitySchema } from "./cache-entities";
import type { ZilobaseAiPageSummary } from "./contracts";

const summarySchema = pageCacheEntitySchema
  .pick({ id: true, name: true, workspaceId: true, updatedAt: true, url: true })
  .extend({
    url: z.string(),
    metadata: z.object({
      emoji: z.string().nullable().optional(),
      zilobaseai: z.enum(["instruction", "skill"]).nullable(),
    }),
  });
export type AiPageReference = { id: string; cacheId: string };
export function normalizeAiPageReferences(
  client: QueryClient,
  read: ReturnType<SharedClient["capture"]>,
  workspaceId: string,
  input: unknown,
): AiPageReference[] {
  const pages = z.array(summarySchema).parse(input);
  if (pages.some((page) => page.workspaceId !== workspaceId))
    throw new Error("AI page scope mismatch");
  const owner = sharedClient(client).resolve(read, workspaceId);
  owner.session.ingest([owner.pages.stage(pages)]);
  return pages.map(({ id }) => ({ id, cacheId: owner.session.id }));
}
export function resolveAiPageReferences(
  client: QueryClient,
  references: AiPageReference[],
): ZilobaseAiPageSummary[] {
  return references.flatMap((reference) => {
    const page = sharedClient(client).get(reference.cacheId)?.pages.get(reference.id);
    const summary = summarySchema.strip().safeParse(page);
    return summary.success ? [summary.data] : [];
  });
}
