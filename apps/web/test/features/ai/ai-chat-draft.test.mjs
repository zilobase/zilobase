export function register({ readSource, assert, test }) {
  test("Ask AI stays a draft until the first message is submitted", async () => {
    const stateSource = await readSource("/src/features/ai/conversation/use-ai-chat-thread-state.ts")
    const actionsSource = await readSource("/src/features/ai/conversation/use-ai-chat-thread-actions.ts")
    const chatbotSource = await readSource("/src/features/ai/components/elements/chatbot.tsx")

    assert.doesNotMatch(stateSource, /useCreateAiChatThread/)
    assert.doesNotMatch(actionsSource, /useCreateAiChatThread/)
    assert.match(actionsSource, /handleStartNewChat[\s\S]*onSelectThread\(null\)/)
    assert.match(chatbotSource, /if \(!targetThreadId\)[\s\S]*createThread[\s\S]*mutateAsync/)
    assert.match(
      chatbotSource,
      /sendMessage\([\s\S]*buildChatRequestBody\(\s*targetThreadId(?:,|\s*\))/,
    )
  })
}
