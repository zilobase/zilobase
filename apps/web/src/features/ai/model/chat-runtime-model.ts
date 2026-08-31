import type { UIMessage } from "ai";
import type { WorkspaceAiChatModel } from "@zilobase/features/ai-chat";

export const fallbackModels: WorkspaceAiChatModel[] = [
  {
    chef: "Zilobase",
    chefSlug: "openai",
    description: "Uses the best enabled workspace model for this task.",
    gatewayId: "auto",
    id: "auto",
    name: "Auto",
    providers: ["openai"],
  },
  {
    chef: "OpenAI",
    chefSlug: "openai",
    gatewayId: "gpt-5.6-sol",
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    providers: ["openai"],
  },
  {
    chef: "OpenAI",
    chefSlug: "openai",
    gatewayId: "gpt-5.6-terra",
    id: "gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    providers: ["openai"],
  },
  {
    chef: "OpenAI",
    chefSlug: "openai",
    gatewayId: "gpt-5.6-luna",
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    providers: ["openai"],
  },
  {
    chef: "OpenAI",
    chefSlug: "openai",
    gatewayId: "gpt-4o",
    id: "gpt-4o",
    name: "GPT-4o",
    providers: ["openai"],
  },
  {
    chef: "OpenAI",
    chefSlug: "openai",
    gatewayId: "gpt-4o-mini",
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    providers: ["openai"],
  },
];

export const emptyAgentChatMessages: UIMessage[] = [];

export const pendingPhrases = [
  "Planning changes",
  "Checking workspace access",
  "Preparing the first step",
];

const providerLogoSlugs: Record<string, string> = {
  fireworks: "fireworks-ai",
  "google-ai-studio": "google",
  together: "togetherai",
};

export function areMessagesEquivalent(
  leftMessages: UIMessage[],
  rightMessages: UIMessage[],
) {
  if (leftMessages === rightMessages) return true;
  if (leftMessages.length !== rightMessages.length) return false;

  return leftMessages.every((leftMessage, index) => {
    const rightMessage = rightMessages[index];

    if (
      leftMessage === rightMessage ||
      (leftMessage.id === rightMessage.id &&
        leftMessage.role === rightMessage.role &&
        leftMessage.parts === rightMessage.parts)
    ) {
      return true;
    }

    return JSON.stringify(leftMessage) === JSON.stringify(rightMessage);
  });
}

export function getProviderLogoSlug(provider: string) {
  return providerLogoSlugs[provider] ?? provider;
}

export function summarizeMessagesForDebug(messages: UIMessage[]) {
  const lastMessage = messages.at(-1);

  return {
    count: messages.length,
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          partTypes: lastMessage.parts.map((part) => part.type),
          role: lastMessage.role,
        }
      : null,
    roles: messages.map((message) => message.role),
  };
}

export function logAiChatError(
  source: string,
  error: unknown,
  context: Record<string, unknown>,
) {
  const errorDetails = getErrorDetails(error);

  console.groupCollapsed(
    `[zilobase ai chat] ${source}: ${errorDetails.message}`,
  );
  console.error(error);
  console.info("error details", errorDetails);
  console.info("context", context);
  console.groupEnd();
}

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      cause: error.cause,
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
    name: typeof error,
  };
}
