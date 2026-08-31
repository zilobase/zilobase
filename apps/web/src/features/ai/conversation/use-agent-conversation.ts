import type { AgentConversationInput } from "@zilobase/features/ai-chat/conversation-adapter";
import { useHttpAgentConversation } from "./use-http-agent-conversation";

export function useAgentConversation(input: AgentConversationInput) {
  return useHttpAgentConversation(input);
}
