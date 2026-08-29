import type {
  AgentCitation,
  AgentToolResult,
} from "@zilobase/features/ai-chat/agent-contract";
import { tool, type ToolCallOptions, type ToolSet } from "ai";
import * as z from "zod";

import type { RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import { aiChatArtifact } from "../../../infrastructure/database/schema";
import { createImageStorage } from "../../../infrastructure/storage/image-storage";
import { runIdempotentAgentAction } from "../actions/agent-action-receipts";
import {
  AI_ARTIFACT_FORMATS,
  generateAiArtifact,
} from "../artifacts/ai-artifact-generator";
import {
  putAiStoredObject,
  sanitizeAiFilename,
  sha256Hex,
} from "../files/ai-file-storage";
import { assertAiAgentArtifactQuota } from "../actions/agent-operations";

const ARTIFACT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

type ArtifactToolContext = {
  env: RuntimeEnv;
  threadId: string;
  userId: string;
  withDb: <T>(fn: () => Promise<T>) => Promise<T>;
  workspaceId: string;
};

const artifactTableSchema = z.object({
  columns: z.array(z.string().max(120)).min(1).max(100),
  rows: z.array(z.array(z.union([
    z.string().max(20_000),
    z.number(),
    z.boolean(),
    z.null(),
  ])).max(100)).max(5_000),
});

const createArtifactSchema = z.object({
  content: z.string().max(500_000).optional(),
  entries: z.array(z.object({
    content: z.string().max(500_000),
    filename: z.string().trim().min(1).max(180),
  })).max(50).optional(),
  filename: z.string().trim().min(1).max(180),
  format: z.enum(AI_ARTIFACT_FORMATS),
  table: artifactTableSchema.optional(),
  title: z.string().trim().min(1).max(240),
}).refine((input) => input.content !== undefined || input.table || input.entries, {
  message: "Provide content, a table, or ZIP entries.",
});

type CreateArtifactInput = z.infer<typeof createArtifactSchema>;
type CreateArtifactResult = AgentToolResult<{
  artifact: {
    byteSize: number;
    checksum: string;
    contentType: string;
    downloadUrl: string;
    expiresAt: string;
    filename: string;
    format: string;
    id: string;
  };
}>;

export function buildArtifactTools(context: ArtifactToolContext): ToolSet {
  return {
    createDownloadableArtifact: tool({
      description:
        "Create a downloadable CSV, XLSX, DOCX, PPTX, PDF, Markdown, JSON, or ZIP artifact from content or a table. Use this only when the user asks for a file/download; do not claim success until the tool returns its durable downloadUrl.",
      inputSchema: createArtifactSchema,
      execute: (input, options) => createArtifact(context, input, options),
    }),
  };
}

async function createArtifact(
  context: ArtifactToolContext,
  input: CreateArtifactInput,
  options: ToolCallOptions,
) {
  return context.withDb(() => runIdempotentAgentAction<CreateArtifactResult>({
    context: {
      threadId: context.threadId,
      userId: context.userId,
      workspaceId: context.workspaceId,
    },
    execute: async () => {
      const generated = generateAiArtifact(input);
      const id = crypto.randomUUID();
      const filename = withExtension(
        sanitizeAiFilename(input.filename, `artifact.${generated.extension}`),
        generated.extension,
      );
      const objectKey = `ai/artifacts/${context.workspaceId}/${context.userId}/${id}/${filename}`;
      const checksum = await sha256Hex(generated.bytes);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ARTIFACT_TTL_MS);

      await assertAiAgentArtifactQuota({
        byteSize: generated.bytes.byteLength,
        env: context.env,
        userId: context.userId,
        workspaceId: context.workspaceId,
      });

      await putAiStoredObject({
        body: generated.bytes,
        contentType: generated.contentType,
        env: context.env,
        objectKey,
      });

      try {
        await db.insert(aiChatArtifact).values({
          byteSize: generated.bytes.byteLength,
          checksum,
          contentType: generated.contentType,
          createdAt: now,
          expiresAt,
          filename,
          id,
          objectKey,
          status: "ready",
          threadId: context.threadId,
          updatedAt: now,
          userId: context.userId,
          workspaceId: context.workspaceId,
        });
      } catch (error) {
        await createImageStorage(context.env).delete(objectKey).catch(() => undefined);
        throw error;
      }

      const downloadUrl = `/api/ai/artifacts/${id}/download`;
      const citation: AgentCitation = {
        id,
        source: "artifact",
        title: filename,
        url: downloadUrl,
      };
      return {
        citations: [citation],
        data: {
          artifact: {
            byteSize: generated.bytes.byteLength,
            checksum,
            contentType: generated.contentType,
            downloadUrl,
            expiresAt: expiresAt.toISOString(),
            filename,
            format: input.format,
            id,
          },
        },
        ok: true,
        status: "succeeded",
        summary: `Created downloadable ${input.format.toUpperCase()} artifact "${filename}".`,
      };
    },
    toolCallId: options.toolCallId,
    toolInput: input,
    toolName: "createDownloadableArtifact",
  }));
}

function withExtension(filename: string, extension: string) {
  const suffix = `.${extension}`;
  return filename.toLowerCase().endsWith(suffix)
    ? filename
    : `${filename.replace(/\.[a-z0-9]+$/i, "")}${suffix}`;
}
