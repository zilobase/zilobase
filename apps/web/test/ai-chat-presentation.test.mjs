import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("Ask AI supports persistent docked and floating desktop modes", async () => {
    const layoutSource = await readFile(
      new URL("../src/components/app-layout.tsx", import.meta.url),
      "utf8",
    )
    const sidebarSource = await readFile(
      new URL("../src/components/chat-sidebar.tsx", import.meta.url),
      "utf8",
    )

    assert.match(
      layoutSource,
      /CHAT_PRESENTATION_MODE_STORAGE_KEY\s*=\s*"zilobase:ai-chat-presentation-mode"/,
    )
    assert.match(
      layoutSource,
      /chatSidebarOpen\s*&&\s*!isMobile\s*&&\s*chatPresentationMode\s*===\s*"floating"/,
    )
    assert.match(layoutSource, /aria-label="Floating Ask AI chat"/)
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
    const layoutSource = await readFile(
      new URL("../src/components/app-layout.tsx", import.meta.url),
      "utf8",
    )
    const historySource = await readFile(
      new URL(
        "../src/components/ai-elements/ai-chat-history-list.tsx",
        import.meta.url,
      ),
      "utf8",
    )

    assert.match(
      layoutSource,
      /onPresentationModeChange=\{isMobile \? undefined : setChatPresentationMode\}/,
    )
    assert.match(historySource, /canPin=\{!isMobile\}/)
    assert.match(historySource, /className="sticky top-0 z-10 pb-2 pt-1"/)
    assert.doesNotMatch(historySource, /sticky top-0 z-10 bg-sidebar px-1/)
  })
}
