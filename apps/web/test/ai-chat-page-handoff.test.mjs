import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("opening the main Ask AI page hands off the sidebar's current chat", async () => {
    const [layoutSource, pageSource, stateSource] = await Promise.all([
      readFile(new URL("../src/components/app-layout.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/pages/ai.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/hooks/use-ai-chat-thread-state.ts", import.meta.url), "utf8"),
    ])

    assert.match(
      layoutSource,
      /if \(pathname === "\/ai" && chatSidebarOpen\) \{[\s\S]*setChatSidebarOpen\(false\)/,
    )
    assert.match(pageSource, /useAiChatThreadState\(\)/)
    assert.match(pageSource, /threadId=\{activeThreadId\}/)
    assert.match(stateSource, /threadStateByWorkspaceId/)
  })
}
