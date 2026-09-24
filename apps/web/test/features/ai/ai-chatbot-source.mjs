const chatbotFiles = [
  "/src/features/ai/conversations/effects/use-page-edit-review.ts",
  "/src/features/ai/conversations/use-conversation-context.ts",
  "/src/features/ai/conversations/use-conversation-model.ts",
  "/src/features/ai/conversations/use-conversation-stream.ts",
  "/src/features/ai/conversations/use-conversation-draft.ts",

  "/src/features/ai/conversations/use-chatbot-conversation.ts",
  "/src/features/ai/conversations/components/chatbot-conversation.tsx",
  "/src/features/ai/conversations/model/conversation-draft.ts",
  "/src/features/ai/conversations/components/elements/chatbot.tsx",
  "/src/features/ai/conversations/components/elements/chatbot-composer.tsx",
  "/src/features/ai/conversations/components/elements/chatbot-messages.tsx",
  "/src/features/ai/conversations/components/elements/chatbot-scroll-control.tsx",
];

export async function readChatbotSource(readSource) {
  return (await Promise.all(chatbotFiles.map((file) => readSource(file)))).join("\n");
}
