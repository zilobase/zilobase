import { readFile } from "node:fs/promises"

export function register({ assert, loadModule, test }) {
  test("AI page citations resolve only local page and database routes", async () => {
    const { getAgentCitationSidePaneTarget } = await loadModule(
      "/src/components/ai-elements/agent-citation-navigation.ts"
    )

    assert.deepEqual(
      getAgentCitationSidePaneTarget({ source: "page", url: "/p/page%201" }),
      { id: "page 1", type: "page" }
    )
    assert.deepEqual(
      getAgentCitationSidePaneTarget({
        source: "page-comment",
        url: "/p/comment-page",
      }),
      { id: "comment-page", type: "page" }
    )
    assert.deepEqual(
      getAgentCitationSidePaneTarget({ source: "database", url: "/d/tasks" }),
      { id: "tasks", type: "database" }
    )
    assert.equal(
      getAgentCitationSidePaneTarget({
        source: "file",
        url: "/api/ai/files/file-1",
      }),
      null
    )
    assert.equal(
      getAgentCitationSidePaneTarget({
        source: "page",
        url: "https://example.com/p/external",
      }),
      null
    )
  })

  test("AI citation pills use the shared side-pane controller and renderers", async () => {
    const chatbotSource = await readFile(
      new URL("../src/components/ai-elements/chatbot.tsx", import.meta.url),
      "utf8",
    )
    const aiPageSource = await readFile(
      new URL("../src/pages/ai.tsx", import.meta.url),
      "utf8",
    )

    assert.match(chatbotSource, /sidePane\.openSidePane\(sidePaneTarget\.id\)/)
    assert.match(
      chatbotSource,
      /sidePane\.openDatabaseSidePane\(sidePaneTarget\.id\)/,
    )
    assert.match(chatbotSource, /openInMainPage=\{isSidebar\}/)
    assert.match(
      chatbotSource,
      /sidePane\.openPageInMainPane\(sidePaneTarget\.id\)/,
    )
    assert.match(
      chatbotSource,
      /sidePane\.openDatabaseInMainPane\(sidePaneTarget\.id\)/,
    )
    assert.match(chatbotSource, /to: "\/p\/\$pageId"/)
    assert.match(chatbotSource, /to: "\/d\/\$databaseId"/)
    assert.match(aiPageSource, /<PageSidePaneLayout/)
    assert.match(aiPageSource, /<PageEditorPane/)
    assert.match(aiPageSource, /<DatabaseMainPane/)
  })
}
