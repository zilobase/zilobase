import { captureClientOperation, type ClientOperationContext } from "../shared/operation-context";
import { aiWriteRequestSchema, type AiWriteRequest } from "./contracts";

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
  { id: "translate", label: "Translate to English", instruction: "Translate it to English." },
] as const;

export function requestAiWriting(context: ClientOperationContext, input: AiWriteRequest) {
  const scope = captureClientOperation(context);
  return scope.context.apiFetch<AiWriteResult>("/ai/write", {
    method: "POST",
    body: JSON.stringify(aiWriteRequestSchema.parse(input)),
  });
}
