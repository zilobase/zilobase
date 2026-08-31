import type { ChatOnFinishCallback, UIMessage } from "ai";

export type AgentConversationInput = {
  apiBaseUrl?: string;
  headers?: HeadersInit;
  id: string;
  initialMessages: UIMessage[];
  onData?(part: { data: unknown; type: string }): void;
  onError(error: Error): void;
  onFinish?: ChatOnFinishCallback<UIMessage>;
  threadId: string | null;
  userId: string | null;
  workspaceId: string | null;
};

export function prepareAgentTurnRequest(input: {
  body?: Record<string, unknown>;
  messages: UIMessage[];
  threadId: string | null;
}) {
  const latest = input.messages.at(-1);
  if (!latest || latest.role !== "user") {
    throw new Error("Only a new user message can create an AI turn.");
  }

  const requestThreadId = typeof input.body?.threadId === "string"
    ? input.body.threadId
    : input.threadId;
  if (!requestThreadId) throw new Error("A chat thread is required.");

  const text = latest.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("A text prompt is required.");

  return {
    requestThreadId,
    body: {
      attachmentIds: Array.isArray(input.body?.attachmentIds)
        ? input.body.attachmentIds
        : [],
      clientMessageId: latest.id,
      clientTurnId: typeof input.body?.clientTurnId === "string"
        ? input.body.clientTurnId
        : crypto.randomUUID(),
      contextRefs: Array.isArray(input.body?.contextRefs)
        ? input.body.contextRefs
        : [],
      mentionedUserIds: Array.isArray(input.body?.mentionedUserIds)
        ? input.body.mentionedUserIds
        : [],
      modelId: typeof input.body?.modelId === "string"
        ? input.body.modelId
        : "auto",
      text,
      threadId: requestThreadId,
    },
  };
}
