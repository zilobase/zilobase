export function register({ readSource, assert, test }) {
  test("Ask AI ships only its native workspace feature boundary", async () => {
    const chatbotSource = await readSource("/src/features/ai/components/elements/chatbot.tsx")
    assert.match(chatbotSource, /@zilobase\/features\/ai-chat/)
    assert.match(chatbotSource, /@zilobase\/features\/workspaces/)
  })
}
