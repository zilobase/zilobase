import { readChatbotSource } from "./ai-chatbot-source.mjs";

export function register({ readSource, assert, loadModule, test }) {
  test("AI page citations resolve only local page and database routes", async () => {
    const { getAgentCitationSidePaneTarget } = await loadModule(
      "/src/features/ai/conversations/components/elements/agent-citation-navigation.ts",
    );

    assert.deepEqual(getAgentCitationSidePaneTarget({ source: "page", url: "/p/page%201" }), {
      id: "page 1",
      type: "page",
    });
    assert.deepEqual(
      getAgentCitationSidePaneTarget({
        source: "page-comment",
        url: "/p/comment-page",
      }),
      { id: "comment-page", type: "page" },
    );
    assert.deepEqual(getAgentCitationSidePaneTarget({ source: "database", url: "/d/tasks" }), {
      id: "tasks",
      type: "database",
    });
    assert.equal(
      getAgentCitationSidePaneTarget({
        source: "file",
        url: "/api/ai/files/file-1",
      }),
      null,
    );
    assert.equal(
      getAgentCitationSidePaneTarget({
        source: "page",
        url: "https://example.com/p/external",
      }),
      null,
    );
  });

  test("AI resource badges use the shared side-pane controller and renderers", async () => {
    const chatbotSource = await readChatbotSource(readSource);
    const badgeSource = await readSource(
      "/src/features/ai/conversations/components/elements/agent-resource-badges.tsx",
    );
    const aiPageSource = await readSource("/src/features/ai/screens/ai.tsx");
    const workspaceSource = await readSource(
      "/src/features/ai/conversations/components/agent-chat-workspace.tsx",
    );

    assert.match(badgeSource, /sidePane\.openSidePane\(sidePaneTarget\.id\)/);
    assert.match(badgeSource, /sidePane\.openDatabaseSidePane\(sidePaneTarget\.id\)/);
    assert.match(chatbotSource, /openInMainPage=\{isSidebar\}/);
    assert.match(badgeSource, /sidePane\.openPageInMainPane\(sidePaneTarget\.id\)/);
    assert.match(badgeSource, /sidePane\.openDatabaseInMainPane\(sidePaneTarget\.id\)/);
    assert.match(badgeSource, /to: "\/p\/\$pageId"/);
    assert.match(badgeSource, /to: "\/d\/\$databaseId"/);
    assert.match(workspaceSource, /<PageSidePaneLayout/);
    assert.match(aiPageSource, /<PageEditorPane/);
    assert.match(aiPageSource, /<DatabaseMainPane/);
  });
  test("citation navigation leaves modified clicks and non-resource links to the browser", async () => {
    const { canOpenCitationInApp } = await loadModule(
      "/src/features/ai/conversations/components/elements/agent-citation-navigation.ts",
    );
    const target = { id: "page", type: "page" };
    const event = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
    assert.equal(canOpenCitationInApp(target, event), true);
    assert.equal(canOpenCitationInApp(null, event), false);
    for (const key of ["metaKey", "ctrlKey", "shiftKey", "altKey"])
      assert.equal(canOpenCitationInApp(target, { ...event, [key]: true }), false);
    for (const button of [1, 2])
      assert.equal(canOpenCitationInApp(target, { ...event, button }), false);
  });
}
