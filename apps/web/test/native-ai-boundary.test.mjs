import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("Ask AI ships only its native workspace feature boundary", async () => {
    const chatbotSource = await readFile(
      new URL("../src/components/ai-elements/chatbot.tsx", import.meta.url),
      "utf8",
    )
    assert.match(chatbotSource, /@zilobase\/features\/ai-chat/)
    assert.match(chatbotSource, /@zilobase\/features\/workspaces/)
  })
}
