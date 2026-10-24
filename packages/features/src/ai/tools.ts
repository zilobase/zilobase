import { z } from "zod";
import type { BuildContextResult } from "@zilobase/page-context";

export const chatToolNameSchema = z.enum([
  "search_workspace",
  "semantic_search_workspace",
  "describe_source",
  "read_page",
  "query_records",
  "read_record",
  "aggregate_records",
]);
export type ChatToolName = z.infer<typeof chatToolNameSchema>;
export const chatToolActivitySchema = z.object({
  id: z.string().max(128),
  name: chatToolNameSchema,
  status: z.enum(["running", "completed", "failed"]),
  label: z.string().max(512),
  query: z.string().max(512).optional(),
  source: z
    .object({
      type: z.enum(["page", "database"]),
      id: z.string().min(1).max(128),
      dataSourceId: z.string().min(1).max(128).optional(),
    })
    .optional(),
  returned: z.number().int().nonnegative().optional(),
  hasMore: z.boolean().optional(),
  error: z.string().max(512).optional(),
  cached: z.boolean().optional(),
});
export type ChatToolActivity = z.infer<typeof chatToolActivitySchema>;
export type ChatReadProgress = {
  activities: ChatToolActivity[];
  canContinue: boolean;
  stopReason?: string | null;
};

const coverageSchema = z.object({
  complete: z.boolean(),
  totalRows: z.number().nonnegative().optional(),
  includedRows: z.number().nonnegative().optional(),
  omittedRows: z.number().nonnegative().optional(),
  reasons: z.array(z.string().max(1024)).max(64),
});
export const chatContextMetadataSchema: z.ZodType<BuildContextResult> = z.object({
  version: z.literal(1),
  markdown: z.literal(""),
  charCount: z.number().int().nonnegative(),
  status: z.enum(["complete", "partial", "blocked"]),
  trimmedAttachmentIds: z.array(z.string().max(128)).max(200),
  omissions: z.array(z.string().max(2048)).max(100),
  manifest: z
    .array(
      z.object({
        key: z.string().max(512),
        type: z.enum(["page", "database", "source", "record"]),
        id: z.string().max(128),
        title: z.string().max(512),
        emoji: z.string().max(16384).nullable().optional(),
        pageId: z.string().max(128).optional(),
        databaseId: z.string().max(128).optional(),
        sourceId: z.string().max(128).optional(),
        provenance: z.object({
          capturedAt: z.string().max(128),
          origin: z.enum(["saved", "local-editor"]),
          revision: z.string().max(2048).optional(),
        }),
        coverage: coverageSchema.optional(),
      }),
    )
    .max(1000),
});
export const chatReadProgressEventSchema = z.object({
  type: z.literal("read-progress"),
  context: chatContextMetadataSchema,
  progress: z.object({
    activities: z.array(chatToolActivitySchema).max(100),
    canContinue: z.boolean(),
    stopReason: z.string().max(128).nullish(),
  }),
});
