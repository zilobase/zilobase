import * as z from "zod";
import { tool } from "ai";
import { appendConversationMessage } from "../conversations/agent-conversation-service";

export function buildAgentConnectionTool(input: { profileId: string; authorUserId: string }) {
  return tool({
    description:
      "Show a Connect account card in the agent conversation when authentication is missing. The human must connect and Save connector permissions before using them.",
    inputSchema: z.object({
      provider: z.enum(["gmail", "github", "linear", "figma"]),
    }),
    execute: async ({ provider }) => {
      await appendConversationMessage({
        profileId: input.profileId,
        authorUserId: input.authorUserId,
        kind: "message",
        role: "assistant",
        parts: [
          {
            type: "data-connector-setup",
            data: { provider, scope: input.profileId },
          },
        ],
      });
      return {
        status: "connection_required",
        message:
          "A Connect button is available in chat. Wait for the human to authenticate and save permissions.",
      };
    },
  });
}
