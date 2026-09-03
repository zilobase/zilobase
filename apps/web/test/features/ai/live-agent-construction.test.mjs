import { readChatbotSource } from "./ai-chatbot-source.mjs"

export function register({ assert, loadModule, readSource, test }) {
  test("pending assistant state stops once visible streamed output arrives", async () => {
    const { shouldShowPendingAssistant } = await loadModule(
      "/src/features/ai/model/chat-message-visibility.ts",
    )
    const userMessage = {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "Hi" }],
    }
    const assistantText = {
      id: "assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "Hello" }],
    }

    assert.equal(shouldShowPendingAssistant([], "submitted"), true)
    assert.equal(shouldShowPendingAssistant([userMessage], "streaming"), true)
    assert.equal(shouldShowPendingAssistant([userMessage, assistantText], "streaming"), false)
    assert.equal(shouldShowPendingAssistant([userMessage], "ready"), false)
  })

  test("streaming database progress can be the final message part", async () => {
    const toolTasks = await readSource(
      "/src/features/ai/components/elements/agent-tool-task.tsx",
    )

    assert.match(
      toolTasks,
      /const nextPart = parts\[candidateIndex\];\s*if \(\s*!nextPart \|\|\s*!isToolUIPart\(nextPart\)/,
    )
  })

  test("Ask AI applies streamed cache effects and exposes incomplete setup recovery", async () => {
    const [
      effects,
      debuggerUi,
      chatbot,
      databaseSteps,
      toolTasks,
      conversation,
      resourceBadges,
    ] = await Promise.all([
      readSource("/src/features/ai/cache/use-agent-live-effects.ts"),
      readSource("/src/features/ai/components/elements/agent-live-debugger.tsx"),
      readChatbotSource(readSource),
      readSource("/src/features/ai/components/elements/database-tool-steps.tsx"),
      readSource("/src/features/ai/components/elements/agent-tool-task.tsx"),
      readSource("/src/features/ai/conversation/use-agent-conversation.ts"),
      readSource("/src/features/ai/components/elements/agent-resource-badges.tsx"),
    ])

    for (const effectKind of ["page-upsert", "database-seed", "nav-delta"]) {
      assert.match(effects, new RegExp(`effect\\.kind === \\"${effectKind}\\"`))
    }
    assert.match(effects, /\{ kind: "page-embed" \}/)
    assert.match(chatbot, /onData:\s*handleAgentStreamData/)
    assert.match(chatbot, /liveDebugger\.onData\(part\)/)
    assert.match(debuggerUi, /data-agent-debug/)
    assert.match(debuggerUi, /import\.meta\.env\.DEV/)
    assert.match(debuggerUi, /Live tool debugger/)
    assert.match(chatbot, /debugStream:\s*import\.meta\.env\.DEV/)
    assert.match(chatbot, /showFeedback=\{feedbackReadyMessageIds\.has\(message\.id\)\}/)
    assert.match(debuggerUi, /Waiting for the first streamed byte/)
    assert.match(debuggerUi, /Preparing.*toolName.*input/s)
    assert.match(chatbot, /AgentProgressOnlyTask/)
    assert.match(toolTasks, /input-streaming/)
    assert.match(toolTasks, /isTransparentToolGroupingPart/)
    assert.match(toolTasks, /data-agent-progress/)
    assert.match(chatbot, /Preparing context/)
    assert.match(databaseSteps, /Retry incomplete setup/)
    assert.match(databaseSteps, /never recreate an existing page or database container/)
    assert.match(databaseSteps, /Database build attempt failed/)
    assert.match(databaseSteps, /Database setup completed after retry/)
    assert.match(databaseSteps, /rejected before any database changes/)
    assert.match(databaseSteps, /\? "failed"/)
    assert.match(conversation, /useHttpAgentConversation/)
    assert.match(resourceBadges, /citation\.source === "database"/)
    assert.match(resourceBadges, /DatabaseIcon/)
  })
}
