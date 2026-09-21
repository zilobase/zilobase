import type { UIMessage } from "ai";

export type ChatAgentIdentity = {
  threadId: string;
  userId: string;
  workspaceId: string;
};

const CHAT_AGENT_INSTANCE_PATTERN =
  /^org-(.+?)-user-(.+)-thread-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function buildChatAgentInstanceName(input: ChatAgentIdentity) {
  return `org-${input.workspaceId}-user-${input.userId}-thread-${input.threadId}`;
}

export function parseChatAgentInstanceName(instance: string) {
  const match = CHAT_AGENT_INSTANCE_PATTERN.exec(instance);
  if (!match) return null;

  return {
    workspaceId: match[1]!,
    userId: match[2]!,
    threadId: match[3]!,
  } satisfies ChatAgentIdentity;
}

export function buildOwnedChatAgentRequest<T extends Record<string, unknown>>(
  instance: string,
  body: T,
) {
  const identity = parseChatAgentInstanceName(instance);
  if (!identity) return null;

  return {
    ...body,
    threadId: identity.threadId,
    userId: identity.userId,
    workspaceId: identity.workspaceId,
  };
}

export function mergeCanonicalChatMessages(
  canonicalMessages: readonly UIMessage[],
  localMessages: readonly UIMessage[],
) {
  const merged = new Map(canonicalMessages.map((message) => [message.id, message]));

  for (const message of localMessages) {
    merged.set(message.id, message);
  }

  return [...merged.values()];
}

export function haveSameChatMessageOrder(
  left: readonly UIMessage[],
  right: readonly UIMessage[],
) {
  return left.length === right.length && left.every(
    (message, index) => message.id === right[index]?.id,
  );
}
