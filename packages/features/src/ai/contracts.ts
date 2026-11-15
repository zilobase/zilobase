import { resolveChatReferences } from "./references";
import type { ChatDebugEvent } from "./debug";
import type { ChatRunReceipt, ChatRunStatus } from "./runs";
import { z } from "zod";
import {
  parsePageDocument,
  type BuildContextResult,
  type ResourceRef,
} from "@zilobase/page-context";
import type { ChatReadProgress } from "./tools";

export const resourceRefSchema = z.object({
  type: z.enum(["page", "database"]),
  id: z.string().min(1).max(128),
});
export const chatRequestSchema = z
  .object({
    workspaceId: z.string().min(1).max(128),
    requestId: z.uuid(),
    threadId: z.uuid().optional(),
    continueFromRunId: z.uuid().optional(),
    text: z.string().trim().min(1).max(20_000),
    roots: z.array(resourceRefSchema).max(20).default([]),
    snapshots: z
      .array(
        z.object({
          pageId: z.string().min(1).max(128),
          capturedAt: z.iso.datetime(),
          content: z.unknown().superRefine((value, ctx) => {
            try {
              parsePageDocument(value);
            } catch {
              ctx.addIssue({ code: "custom", message: "Invalid or oversized page document" });
            }
          }),
        }),
      )
      .max(0, "Editor snapshots are not accepted. Mention a saved source instead.")
      .default([]),
    history: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          text: z.string().max(32_000),
          roots: z.array(resourceRefSchema).max(20),
        }),
      )
      .max(0, "Conversation history is owned by the server")
      .default([]),
  })
  .strict()
  .transform((request, ctx) => {
    const resolved = resolveChatReferences(request.text, request.roots);
    if (resolved.roots.length > 20)
      ctx.addIssue({
        code: "custom",
        path: ["text"],
        message: "Mention at most 20 distinct sources.",
      });
    if (resolved.text.length > 20_000)
      ctx.addIssue({
        code: "custom",
        path: ["text"],
        message: "Message exceeds the size limit after normalizing references.",
      });
    return { ...request, ...resolved };
  });
export type ChatRequestInput = z.input<typeof chatRequestSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatEvent =
  | { type: "snapshot"; run: ChatRunReceipt }
  | { type: "context"; context: BuildContextResult; threadId?: string }
  | { type: "debug"; events: ChatDebugEvent[]; omitted: number }
  | { type: "delta"; text: string }
  | { type: "replace-text"; text: string }
  | { type: "read-progress"; context: BuildContextResult; progress: ChatReadProgress }
  | { type: "done"; status: "completed" | "stopped"; inputTokens?: number; outputTokens?: number }
  | { type: "error"; message: string };
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  roots?: ResourceRef[];
  context?: BuildContextResult;
  progress?: ChatReadProgress;
  debug?: { events: ChatDebugEvent[]; omitted: number };
  runId?: string;
  status?: "completed" | "stopped" | "failed" | "interrupted" | "streaming";
  /** The user's saved rating of an assistant answer. */
  feedback?: { rating: "like" | "dislike"; comment?: string } | null;
};

export type ChatThread = {
  id: string;
  workspaceId: string;
  title: string;
  updatedAt: string;
  status?: ChatRunStatus;
};
export type ChatThreadDetail = {
  run?: ChatRunReceipt | null;
  thread: ChatThread;
  messages: ChatMessage[];
  roots: ResourceRef[];
};

/** Inline AI writing in the editor (POST /ai/write). */
export const aiWriteRequestSchema = z
  .object({
    workspaceId: z.string().min(1).max(128),
    instruction: z.string().trim().min(1).max(2_000),
    /** Markdown the result replaces; omit to write new content at the cursor. */
    selection: z.string().max(20_000).optional(),
    /** Markdown around the cursor, used for tone and continuity only. */
    context: z.string().max(20_000).optional(),
    /** Stream the Markdown as plain text instead of returning JSON. */
    stream: z.boolean().optional(),
  })
  .strict();
export type AiWriteRequest = z.infer<typeof aiWriteRequestSchema>;

/** Undo one AI workspace action call (POST /ai/actions/undo). */
export const actionUndoRequestSchema = z
  .object({
    workspaceId: z.string().min(1).max(128),
    invocationId: z.string().min(1).max(128),
    callId: z.string().min(1).max(256),
  })
  .strict();
export type ActionUndoRequest = z.infer<typeof actionUndoRequestSchema>;

/** The user's Confirm or Cancel for a proposed destructive action (POST /ai/actions/decide). */
export const actionDecisionRequestSchema = actionUndoRequestSchema
  .extend({ decision: z.enum(["confirm", "cancel"]) })
  .strict();
export type ActionDecisionRequest = z.infer<typeof actionDecisionRequestSchema>;

/** Models sometimes fence a whole writing answer despite the instructions. */
export function unwrapMarkdownFence(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/i);
  return fenced ? fenced[1]!.trim() : trimmed;
}

/** Rate an assistant answer (POST /ai/feedback); a null rating clears it. */
export const chatFeedbackRequestSchema = z
  .object({
    workspaceId: z.string().min(1).max(128),
    messageId: z.string().min(1).max(256),
    rating: z.enum(["like", "dislike"]).nullable(),
    comment: z.string().trim().max(2_000).optional(),
  })
  .strict();
export type ChatFeedbackRequest = z.infer<typeof chatFeedbackRequestSchema>;
