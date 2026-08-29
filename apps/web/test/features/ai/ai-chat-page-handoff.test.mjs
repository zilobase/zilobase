export function register({ readSource, assert, test }) {
  test("opening the main Ask AI page hands off the sidebar's current chat", async () => {
    const [layoutSource, pageSource, stateSource] = await Promise.all([
      readSource("/src/app/shell/content/app-layout.tsx"),
      readSource("/src/features/ai/pages/ai.tsx"),
      readSource("/src/features/ai/conversation/use-ai-chat-thread-state.ts"),
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
