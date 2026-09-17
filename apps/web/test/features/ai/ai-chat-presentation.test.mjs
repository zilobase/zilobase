import { readChatbotSource } from "./ai-chatbot-source.mjs"

export function register({ readSource, assert, test }) {
  test("Ask AI supports persistent docked and floating desktop modes", async () => {
    const layoutSource = await readSource("/src/app/shell/content/app-layout.tsx")
    const sidebarSource = await readSource("/src/features/ai/conversations/components/chat-sidebar.tsx")

    assert.match(
      layoutSource,
      /CHAT_PRESENTATION_MODE_STORAGE_KEY\s*=\s*"zilobase:ai-chat-presentation-mode"/,
    )
    assert.match(
      layoutSource,
      /chatSidebarOpen\s*&&\s*!isMobile\s*&&\s*chatPresentationMode\s*===\s*"floating"/,
    )
    assert.match(layoutSource, /aria-label="Floating Ask AI chat"/)
    assert.match(layoutSource, /<FloatingWidget aria-label="Floating Ask AI chat">/)
    assert.match(
      layoutSource,
      /chatPanel=\{dockedChatOpen \? chatPanel : null\}/,
    )
    assert.match(
      sidebarSource,
      /export type ChatPresentationMode = "floating" \| "sidebar"/,
    )
    assert.match(sidebarSource, /onPresentationModeChange/)
  })

  test("mobile Ask AI hides desktop-only floating and pin controls", async () => {
    const layoutSource = await readSource("/src/app/shell/content/app-layout.tsx")
    const historySource = await readSource("/src/features/ai/conversations/components/elements/ai-chat-history-list.tsx")

    assert.match(
      layoutSource,
      /onPresentationModeChange=\{isMobile \? undefined : setChatPresentationMode\}/,
    )
    assert.match(historySource, /canPin=\{!isMobile\}/)
    assert.match(historySource, /className="sticky top-0 z-10 pb-2 pt-1"/)
    assert.doesNotMatch(historySource, /sticky top-0 z-10 bg-sidebar px-1/)
  })

  test("full-page Ask AI uses the page viewport and hides the duplicate launcher", async () => {
    const aiPageSource = await readSource("/src/features/ai/screens/ai.tsx")
    const workspaceSource = await readSource("/src/features/ai/conversations/components/agent-chat-workspace.tsx")
    const chatbotSource = await readChatbotSource(readSource)
    const layoutSource = await readSource("/src/app/shell/content/app-layout.tsx")
    const headerSource = await readSource("/src/app/shell/content/app-header.tsx")
    const sidePaneSource = await readSource("/src/features/pages/pane/page-side-pane.tsx")

    assert.match(layoutSource, /chatSidebarOpen \|\| isAiPage \|\| Boolean\(agentId\) \|\| isMailPage \? null/)
    assert.match(sidePaneSource, /data-page-scroll-viewport/)
    assert.match(chatbotSource, /\[data-ai-scroll-shell\], \[data-page-scroll-viewport\]/)
    assert.match(chatbotSource, /isSidebar\s*\? undefined\s*:\s*"h-auto! overflow-visible! \[scrollbar-gutter:auto\]!"/)
    assert.match(aiPageSource, /<AgentChatWorkspace/)
    assert.match(workspaceSource, /mainScrollClassName="overscroll-y-none"/)
    assert.doesNotMatch(workspaceSource, /standalone/)
    assert.match(layoutSource, /aiWorkspaceSidePaneOpen/)
    assert.match(layoutSource, /auxiliarySidePaneOpen=\{showAuxiliaryWorkspaceSidePaneLayout\}/)
    assert.match(headerSource, /auxiliarySidePaneOpen \|\| showItemSidePaneHeader/)
    assert.doesNotMatch(aiPageSource, /<main className="[^"]*overflow-hidden/)
  })

  test("Universal Ask AI uses the standard side-pane controls without an agent rail", async () => {
    const workspaceSource = await readSource("/src/features/ai/conversations/components/agent-chat-workspace.tsx")
    const settingsSource = await readSource("/src/features/ai/settings/components/ai-settings-panel.tsx")
    const agentSettingsSource = await readSource("/src/features/ai/settings/components/agent-settings-page.tsx")
    const headerSource = await readSource("/src/app/shell/content/app-header.tsx")
    const paneHeaderSource = await readSource("/src/features/pages/pane/page-pane-header.tsx")

    assert.match(workspaceSource, /\{isSidebar\s*\?\s*\(?\s*<ChatHeader/)
    assert.match(workspaceSource, /aria-label="Ask AI settings"/)
    assert.doesNotMatch(workspaceSource, /AgentRail|Add Agent|draftAgentProfileId=\{selectedAgentId\}/)
    assert.doesNotMatch(workspaceSource, /draftAgentProfileId|draftAgentName|draftAgentDescription/)
    assert.match(headerSource, /id="agent-settings-header-actions"/)
    assert.match(headerSource, /<PageSidePaneCollapseButton\s+label=\{props\.auxiliarySidePaneCloseLabel \?\? "Close AI settings"\}\s+onClick=\{props\.onCloseAuxiliarySidePane\}/)
    assert.match(paneHeaderSource, /export function PageSidePaneCollapseButton/)
    assert.match(paneHeaderSource, /<PageSidePaneCollapseButton onClick=\{onClose\} \/>/)
    assert.doesNotMatch(settingsSource, /<header className="[^"]*border-b/)
    assert.doesNotMatch(settingsSource, /overflow-x-auto border-b/)
    assert.doesNotMatch(settingsSource, /AgentEditor|CreateAgentForm|creatingAgent/)
    assert.doesNotMatch(agentSettingsSource, /overflow-x-auto border-b/)
  })

  test("Custom Agents reuse the full-height page side-pane workspace", async () => {
    const agentPageSource = await readSource("/src/features/ai/screens/custom-agent.tsx")
    const agentHeaderSource = await readSource("/src/features/ai/screens/custom-agent-header-actions.tsx")
    const layoutSource = await readSource("/src/app/shell/content/app-layout.tsx")
    const pageMetadataSource = await readSource("/src/features/databases/access/page-metadata.tsx")

    assert.match(agentPageSource, /<PageSidePaneLayout/)
    assert.match(agentPageSource, /<PageMetadata/)
    assert.match(agentPageSource, /<AgentChatLayout>/)
    assert.match(agentPageSource, /enableComments=\{false\}/)
    assert.match(agentHeaderSource, /"agent-share"/)
    assert.match(agentHeaderSource, /export function CustomAgentShareHeaderAction/)
    assert.match(agentHeaderSource, /Open Custom Agent settings/)
    assert.match(agentPageSource, /<ChatbotMessages/)
    assert.match(agentPageSource, /<ChatbotComposer/)
    assert.match(agentPageSource, /<AgentChat\s+agentId=\{agentId\}/)
    assert.match(agentPageSource, /<AgentSettingsPage/)
    assert.doesNotMatch(agentPageSource, /useUpdateAiAgentProfile/)
    assert.doesNotMatch(agentPageSource, /<TabsTrigger value="chat">/)
    assert.match(pageMetadataSource, /placeholder:text-content-secondary placeholder:opacity-60/)
    assert.match(layoutSource, /agentWorkspaceSidePaneOpen = agentWorkspacePanel === "settings"/)
    assert.match(layoutSource, /showAiWorkspaceSidePaneLayout \|\| showAgentWorkspaceSidePaneLayout/)
    assert.match(layoutSource, /auxiliarySidePaneCloseLabel=\{agentId \? "Close Custom Agent settings" : "Close AI settings"\}/)
  })

  test("the Agents sidebar header creates a standalone agent", async () => {
    const agentsSectionSource = await readSource("/src/features/sidebar/components/agents-section.tsx")

    assert.match(agentsSectionSource, /aria-label="Create agent"/)
    assert.match(agentsSectionSource, /mutateAsync\(\{ name: "Untitled agent" \}\)/)
    assert.match(agentsSectionSource, /to: "\/agents\/\$agentId"/)
    assert.doesNotMatch(agentsSectionSource, /if \(!agents\.data\?\.length\) return null/)
  })

  test("Ask AI and Custom Agents share route-driven side pane behavior", async () => {
    const workspaceSource = await readSource("/src/features/ai/conversations/components/agent-chat-workspace.tsx")
    const agentPageSource = await readSource("/src/features/ai/screens/custom-agent.tsx")
    const headerSource = await readSource("/src/app/shell/content/app-header.tsx")

    assert.match(workspaceSource, /routeSearch\.get\("panel"\) === "settings"/)
    assert.match(workspaceSource, /url\.searchParams\.delete\("p"\)/)
    assert.match(workspaceSource, /url\.searchParams\.delete\("d"\)/)
    assert.match(workspaceSource, /<PageSidePaneLayout/)
    assert.match(agentPageSource, /<PageSidePaneLayout/)
    assert.match(headerSource, /showAgentActionsInSidePane/)
    assert.match(headerSource, /<CustomAgentShareHeaderAction agentId=\{props\.agentId\}/)
  })

  test("Ask AI and custom agents edit isolated instruction drafts", async () => {
    const settingsSource = await readSource("/src/features/ai/settings/components/ai-settings-panel.tsx")
    const pageSource = await readSource("/src/features/ai/settings/components/agent-settings-page.tsx")
    const workspaceSource = await readSource("/src/features/ai/conversations/components/agent-chat-workspace.tsx")
    assert.match(settingsSource, /<AgentSettingsPage/)
    assert.match(pageSource, /<PageEditorPane/)
    assert.match(pageSource, /<SavedInstructionPicker/)
    assert.match(pageSource, /<SettingsDraftActions draft=\{draft\}/)
    assert.doesNotMatch(settingsSource, /mode="skill"|Instructions & Skills/)
    assert.doesNotMatch(workspaceSource, /<PageEditorPane/)
  })
  test("agent profile controls share the settings draft and use page controls", async () => {
    const chat = await readSource("/src/features/ai/screens/custom-agent.tsx")
    const pane = await readSource("/src/features/ai/settings/components/agent-settings-page.tsx")
    const connectors = await readSource("/src/features/ai/settings/components/settings-connectors.tsx")
    for (const field of ["Title", "Description", "Icon", "Cover", "IconPosition"]) {
      assert.ok(chat.includes(`on${field}Change=`))
    }
    assert.match(chat, /draft=\{draft\}/)
    assert.match(pane, /bg-surface-canvas dark:bg-surface-navigation/)
    assert.doesNotMatch(pane, /Default model|Response style|<select|<option/)
    assert.doesNotMatch(connectors, /<select|<option|<input/)
    assert.match(connectors, /<McpConnectionsPanel/)
    assert.match(pane, /<SelectTrigger/)
  })

  test("agent sharing stays in the Share popover and stages the shared draft", async () => {
    const actions = await readSource("/src/features/ai/screens/custom-agent-header-actions.tsx")
    const sharing = await readSource("/src/features/ai/settings/components/agent-sharing.tsx")
    const pane = await readSource("/src/features/ai/settings/components/agent-settings-page.tsx")
    const chat = await readSource("/src/features/ai/screens/custom-agent.tsx")
    assert.match(actions, /"agent-share"/)
    assert.match(chat, /<AgentSharePopover/)
    assert.match(sharing, /<PopoverAnchor/)
    assert.match(sharing, /draft\.patch\(/)
    assert.match(sharing, /draft\.publish\.mutate/)
    assert.doesNotMatch(sharing, /useReplaceAiAgentProfileAccess/)
    assert.doesNotMatch(pane, />Sharing</)
  })

  test("agent metadata preserves agent labels and opt-in descriptions", async () => {
    const chat = await readSource("/src/features/ai/screens/custom-agent.tsx")
    const metadata = await readSource("/src/features/databases/access/page-metadata.tsx")
    assert.match(chat, /headingLabel="Agent"/)
    assert.match(chat, /titlePlaceholder="Untitled agent"/)
    assert.match(chat, /descriptionInitiallyHidden/)
    assert.match(metadata, /hasDescription && !showDescription && editable/)
    assert.doesNotMatch(chat, /How can I help\?/)
  })
  test("both chats keep the composer outside their scrolling history", async () => {
    const chat = await readSource("/src/features/ai/screens/custom-agent.tsx")
    const personal = await readSource("/src/features/ai/conversations/components/chatbot-conversation.tsx")
    for (const source of [chat, personal]) {
      assert.match(source, /data-ai-scroll-shell[\s\S]*?overflow-y-auto/)
      assert.match(source, /<\/AgentChatLayout>\s*<\/div>\s*<AgentChatLayout[^>]*>\s*\{beforeComposer\}\s*<ChatbotComposer/)
    }
  })

  test("instruction editing enables slash blocks, titles and saved page selection", async () => {
    const pane = await readSource("/src/features/ai/settings/components/agent-settings-page.tsx")
    const picker = await readSource("/src/features/ai/settings/components/saved-instruction-picker.tsx")
    const header = await readSource("/src/app/shell/content/app-header.tsx")
    assert.match(pane, /<PageEditorPane/)
    assert.match(pane, /showCollaborationPresence/)
    assert.match(pane, /instructionPageId/)
    assert.match(picker, /Use saved instruction/)
    assert.match(picker, /<DropdownMenuContent/)
    assert.doesNotMatch(picker, /<Select|<Command/)
    assert.match(header, /id="agent-settings-header-actions"/)
    assert.doesNotMatch(pane, /aria-label="Close settings"|<XIcon/)
  })

  test("agent settings review opens the panel and uses editor diffs with the merged tab order", async () => {
    const pane = await readSource("/src/features/ai/settings/components/agent-settings-page.tsx")
    const actions = await readSource("/src/features/ai/settings/components/settings-draft-actions.tsx")
    const editor = await readSource("/src/features/editor/composition/editor.tsx")
    assert.match(pane, /"connectors",[\s\S]*?\["access"\][\s\S]*?"activity",\s*"versions"/)
    assert.match(pane, /Triggers & Access/)
    assert.match(pane, /aria-label="Unsaved changes"/)
    assert.match(actions, /onClick=\{draft.reviewChanges\}/)
    assert.match(editor, /baselineMarkdown: reviewDiff.beforeMarkdown/)
    assert.match(editor, /useBeforeBaseline: true/)
  })

  test("slash-menu pointer selection invokes an async command only once", async () => {
    const menu = await readSource("/src/features/editor/extensions/slash-command-menu.tsx")
    assert.match(menu, /onSelect=\{\(\) => selectItem\(index\)\}/)
    assert.doesNotMatch(menu, /onMouseDown=\{[^}]*selectItem\(index\)/)
  })

}
