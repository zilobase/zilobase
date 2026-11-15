import { captureClientOperation, type ClientOperationContext } from "../shared/operation-context";
import type { ChatToolActivity } from "./tools";
import {
  actionDecisionRequestSchema,
  actionUndoRequestSchema,
  type ActionDecisionRequest,
  aiWriteRequestSchema,
  type ActionUndoRequest,
  type AiWriteRequest,
  unwrapMarkdownFence,
} from "./contracts";

/*
 * Inline AI writing in the editor: the client sends the selection or the text
 * before the cursor as Markdown, and receives Markdown to preview, then insert
 * or replace with its own editor transaction (so it joins the user's undo history).
 */

export type AiWriteResult = { markdown: string };

/** Quick actions offered for a selection, matching Notion AI's edit menu. */
export const aiSelectionActions = [
  {
    id: "improve",
    label: "Improve writing",
    instruction: "Improve the writing: clearer and more fluent, same meaning and tone.",
  },
  {
    id: "grammar",
    label: "Fix spelling & grammar",
    instruction: "Fix spelling and grammar only. Change nothing else.",
  },
  {
    id: "shorter",
    label: "Make shorter",
    instruction: "Make it shorter while keeping the key points.",
  },
  {
    id: "longer",
    label: "Make longer",
    instruction: "Expand it with more detail in the same style.",
  },
  {
    id: "simplify",
    label: "Simplify language",
    instruction: "Rewrite it in simpler, plain language.",
  },
  { id: "summarize", label: "Summarize", instruction: "Summarize it in a few sentences." },
] as const;

/** Target languages offered by "Translate to" in the selection menu. */
export const aiTranslationLanguages = [
  "English",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Italian",
  "Dutch",
  "Japanese",
  "Korean",
  "Chinese (Simplified)",
  "Hindi",
  "Arabic",
] as const;

export const translateInstruction = (language: string) =>
  `Translate it to ${language}. Keep its formatting, links and names.`;

export function requestAiWriting(context: ClientOperationContext, input: AiWriteRequest) {
  const scope = captureClientOperation(context);
  return scope.context.apiFetch<AiWriteResult>("/ai/write", {
    method: "POST",
    body: JSON.stringify(aiWriteRequestSchema.parse(input)),
  });
}

/** Undoes one AI workspace action call; the server applies its recorded inverses. */
export function undoAiAction(context: ClientOperationContext, input: ActionUndoRequest) {
  const scope = captureClientOperation(context);
  return scope.context.apiFetch<{ undone: number }>("/ai/actions/undo", {
    method: "POST",
    body: JSON.stringify(actionUndoRequestSchema.parse(input)),
  });
}

/** Confirms or cancels a destructive action the AI proposed; only the user can decide. */
export function decideAiAction(context: ClientOperationContext, input: ActionDecisionRequest) {
  const scope = captureClientOperation(context);
  return scope.context.apiFetch<{
    status: "completed" | "cancelled";
    changes: NonNullable<ChatToolActivity["changes"]>;
  }>("/ai/actions/decide", {
    method: "POST",
    body: JSON.stringify(actionDecisionRequestSchema.parse(input)),
  });
}

/** Streams generated Markdown, reporting the text so far; falls back to one response. */
export async function streamAiWriting(
  context: ClientOperationContext,
  input: AiWriteRequest,
  onText: (text: string) => void,
): Promise<AiWriteResult> {
  const scope = captureClientOperation(context);
  const streamFetch = scope.context.streamFetch;
  if (!streamFetch) return requestAiWriting(context, input);
  const response = await streamFetch("/ai/write", {
    method: "POST",
    body: JSON.stringify(aiWriteRequestSchema.parse({ ...input, stream: true })),
  });
  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "AI couldn't write this.");
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    scope.assertCurrent();
    text += value;
    onText(text);
  }
  return { markdown: unwrapMarkdownFence(text) };
}
