import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("Ask AI stays a draft until the first message is submitted", async () => {
    const stateSource = await readFile(
      new URL("../src/hooks/use-ai-chat-thread-state.ts", import.meta.url),
      "utf8",
    )
    const actionsSource = await readFile(
      new URL("../src/hooks/use-ai-chat-thread-actions.ts", import.meta.url),
      "utf8",
    )
    const chatbotSource = await readFile(
      new URL("../src/components/ai-elements/chatbot.tsx", import.meta.url),
      "utf8",
    )

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
