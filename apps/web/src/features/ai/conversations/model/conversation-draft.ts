import type { ContextAttachment, ContextSourceRef } from "@zilobase/page-context";

export function buildConversationRequest(input: {
  attachments: ContextAttachment[];
  primarySource: ContextSourceRef | null;
  modelId: string;
  debugStream: boolean;
  threadId: string | null;
  attachmentIds: string[];
  clientTurnId: string;
}) {
  return {
    attachmentIds: input.attachmentIds,
    clientTurnId: input.clientTurnId,
    contextRefs: [
      ...(input.primarySource
        ? [
            {
              id: input.primarySource.id,
              role: "primary" as const,
              type: input.primarySource.type,
            },
          ]
        : []),
      ...input.attachments
        .filter((attachment) => attachment.type === "page" || attachment.type === "database")
        .map((attachment) => ({
          id: attachment.id,
          role: "attached" as const,
          type: attachment.type as "page" | "database",
        })),
    ],
    modelId: input.modelId,
    debugStream: input.debugStream,
    mentionedUserIds: input.attachments
      .filter((attachment) => attachment.type === "person")
      .map((attachment) => attachment.id),
    threadId: input.threadId,
  };
}

export function removeDraftMention(
  text: string,
  mention: { mentionStart: number; mentionQuery: string },
) {
  const before = text.slice(0, mention.mentionStart);
  const after = text.slice(mention.mentionStart + 1 + mention.mentionQuery.length);
  return { text: `${before}${after}`.trimStart(), cursor: before.length };
}

export function conversationReadiness(
  workspaceId: string | null | undefined,
  userId: string | null,
  threadId: string | null,
) {
  return {
    isAgentReady: Boolean(workspaceId && userId && threadId),
    isComposerReady: Boolean(workspaceId && userId),
    conversationId: threadId ?? "chat-not-ready",
  };
}

export function canApplyConversationEdits(
  isSidebar: boolean,
  pageId: string | null,
  accessLevel: string | null | undefined,
) {
  return Boolean(isSidebar && pageId && (accessLevel === "edit" || accessLevel === "full"));
}
