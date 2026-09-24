export function register({ readSource, assert, test }) {
  test("opening the main Ask AI page hands off the sidebar's current chat", async () => {
    const [layoutSource, pageSource, stateSource, workspaceSource] = await Promise.all([
      readSource("/src/app/shell/content/app-layout.tsx"),
      readSource("/src/features/ai/screens/ai.tsx"),
      readSource("/src/features/ai/conversations/use-ai-chat-thread-state.ts"),
      readSource("/src/features/ai/conversations/components/agent-chat-workspace.tsx"),
    ]);

    assert.match(
      layoutSource,
      /if \(pathname === "\/ai" && chatSidebarOpen\) \{[\s\S]*setChatSidebarOpen\(false\)/,
    );
    assert.match(pageSource, /<AgentChatWorkspace/);
    assert.match(workspaceSource, /useAiChatThreadState\(\{\s*enabled:\s*open,?\s*\}\)/);
    assert.match(workspaceSource, /threadId=\{activeThreadId\}/);
    assert.match(stateSource, /threadStateByWorkspaceId/);
  });
}
