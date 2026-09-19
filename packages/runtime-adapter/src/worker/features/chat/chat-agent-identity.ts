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
