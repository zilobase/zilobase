export function register({ assert, loadModule, readSource, test }) {
  test("Mail is a fixed default sidebar tab with complete folder shortcuts", async () => {
    const { defaultSidebarWorkspaceLayout, mailViewIds, normalizeSidebarWorkspaceLayout } = await loadModule(
      "/packages/features/src/user-settings/sidebar-config.ts",
    )
    const mail = defaultSidebarWorkspaceLayout.tabs.find((tab) => tab.id === "mail")

    assert.equal(mail.id, "mail")
    assert.equal(mail.name, "Mail")
    assert.equal(mail.icon, "mail")
    assert.deepEqual(mail.shortcuts.slice(1).map((shortcut) => shortcut.target.view), mailViewIds)
    assert.deepEqual(mail.shortcuts[0].target, { action: "composeMail", type: "action" })

    const normalized = normalizeSidebarWorkspaceLayout({
      tabs: [{ icon: "home", id: "home", name: "Home", sections: [], shortcuts: [] }],
      taskDatabaseIds: [],
    })
    assert.equal(normalized.tabs[2].id, "mail")
  })

  test("Mail route uses grouped list rows and compact page spacing", async () => {
    const [routeSource, mailSource] = await Promise.all([
      readSource("/src/app/routing/route-groups/app-routes.tsx"),
      readSource("/src/features/mail/pages/mail.tsx"),
    ])

    assert.match(routeSource, /isFeatureEnabled\("mail"\)[\s\S]*path: "\/mail"[\s\S]*validateSearch: validateMailSearch[\s\S]*component: MailPage/)
    assert.match(mailSource, /px-4 pb-8 pt-5 sm:px-6 md:px-10 lg:px-12/)
    assert.match(mailSource, /messageGroups\s*\.map/)
    assert.match(mailSource, /<MailThreadRow/)
    assert.doesNotMatch(mailSource, /<table|DatabaseTableView/)
    assert.doesNotMatch(mailSource, /group\/mail-row[^\n]*border-b/)
    assert.match(mailSource, /group\/mail-row flex h-9/)
    assert.doesNotMatch(mailSource, /getInitials|avatarClassName/)
    assert.doesNotMatch(mailSource, /primaryViews|aria-label="Mail views"|visibleMessages\.length/)
    assert.match(mailSource, /aria-label="Search mail"[\s\S]*aria-label="Refresh mail"/)
    assert.match(mailSource, /justify-between[\s\S]*ActiveViewIcon[\s\S]*text-xl[\s\S]*activeViewLabel[\s\S]*aria-label="Search mail"/)
    assert.match(mailSource, /ActiveViewIcon className="size-5/)
    assert.doesNotMatch(mailSource, /A calm place for conversations/)
    assert.match(mailSource, /aria-expanded=\{!collapsedGroups\.has\(key\)\}/)
    assert.doesNotMatch(mailSource, /border-b border-stroke-default pb-2|<PlusIcon \/>[\s\S]*Compose/)
  })

  test("Mail hides the global Ask AI launcher", async () => {
    const appLayoutSource = await readSource("/src/app/shell/content/app-layout.tsx")

    assert.match(
      appLayoutSource,
      /chatSidebarOpen \|\| isAiPage \|\| isMailPage \? null : \([\s\S]*<ChatSidebarTrigger/,
    )
  })

  test("Mail navigation is connected to sidebar shortcuts and breadcrumbs", async () => {
    const [shortcutSource, headerSource] = await Promise.all([
      readSource("/src/features/sidebar/components/sidebar-shortcut-list.tsx"),
      readSource("/src/features/pages/components/page-pane-header.tsx"),
    ])

    assert.match(shortcutSource, /target\.type === "mail"[\s\S]*to: "\/mail"/)
    assert.match(shortcutSource, /target\.action === "composeMail"[\s\S]*compose: true/)
    assert.match(headerSource, /pathname === "\/mail"[\s\S]*mailViewIds\.includes\(requestedView[\s\S]*mailViewLabels\[mailView\]/)
  })

  test("disconnected mail offers Google connection and desktop uses the system browser", async () => {
    const mailSource = await readSource("/src/features/mail/pages/mail.tsx")

    assert.match(mailSource, /Connect your Gmail account/)
    assert.match(mailSource, /method: "POST"/)
    assert.match(mailSource, /open_mail_authorization_url/)
    assert.match(mailSource, /Preparing your mailbox/)
    assert.match(mailSource, /<ConnectedMailbox connection=\{connectionQuery\.data\}/)
  })

  test("Mail messages open in the shared side pane with dialog and row navigation controls", async () => {
    const [appLayoutSource, mailSource, paneSource, presentationSource] = await Promise.all([
      readSource("/src/app/shell/content/app-layout.tsx"),
      readSource("/src/features/mail/pages/mail.tsx"),
      readSource("/src/features/pages/context/page-side-pane.tsx"),
      readSource("/src/features/pages/components/embedded-item-presentation-dropdown.tsx"),
    ])

    assert.match(mailSource, /<PageSidePaneShell[\s\S]*<PageSidePaneLayout/)
    assert.match(mailSource, /<PageSidePaneHeaderCell[\s\S]*side="main"[\s\S]*<PagePaneHeader[\s\S]*leadingControl=\{<MainPaneHeaderLeadingControl \/>\}[\s\S]*showActions=\{false\}/)
    assert.match(mailSource, /<PageSidePaneHeaderCell side="side"[\s\S]*<ConversationToolbar/)
    assert.match(mailSource, /onOpen=\{\(\) => setSelection\(thread\.id\)\}/)
    assert.match(mailSource, /onPrefetch=\{\(\) => void controller\.prefetchThread\(thread\.id\)\}/)
    assert.match(mailSource, /onFocus=\{onPrefetch\}[\s\S]*onPointerEnter=\{onPrefetch\}/)
    assert.match(mailSource, /Promise\.all\(\[worker\(\), worker\(\)\]\)/)
    assert.match(mailSource, /requestIdleCallback/)
    assert.match(mailSource, /selected=\{selection === thread\.id\}/)
    assert.match(mailSource, /data-selected=\{selected \? "true" : undefined\}/)
    assert.match(mailSource, /selected \? "bg-action-neutral-hover text-action-on-neutral"/)
    assert.match(mailSource, /aria-label="Open previous message"[\s\S]*aria-label="Open next message"/)
    assert.match(mailSource, /<EmbeddedItemPresentationDropdown[\s\S]*itemLabel="mail"/)
    assert.match(mailSource, /<Dialog open=\{Boolean\(selectedThread && presentation === "dialog"\)\}/)
    assert.doesNotMatch(mailSource, /ConversationToolbar[\s\S]*border-b border-stroke-default/)
    assert.match(appLayoutSource, /embeddedMobileViewer \|\| isMailPage \? undefined/)
    assert.match(presentationSource, /embeddedItemsOpenAsModes\.map/)
    assert.match(paneSource, /header \? "row-start-2" : "row-start-1"/)
  })

  test("mail renders live Dexie threads, lazy bodies, and scriptless sanitized HTML", async () => {
    const [mailSource, controllerSource, htmlSource] = await Promise.all([
      readSource("/src/features/mail/pages/mail.tsx"),
      readSource("/src/features/mail/model/mail-sync-controller.ts"),
      readSource("/src/features/mail/model/mail-html.ts"),
    ])

    assert.doesNotMatch(mailSource, /starterMailMessages|setMessages/)
    assert.match(controllerSource, /useLiveQuery/)
    assert.match(controllerSource, /applyMailSyncResponse/)
    assert.match(controllerSource, /upsertFullMailThread/)
    assert.match(controllerSource, /threadLoads[\s\S]*loadMailThreadOnce[\s\S]*prefetchThread/)
    assert.match(controllerSource, /URL\.createObjectURL[\s\S]*URL\.revokeObjectURL/)
    assert.match(mailSource, /sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"/)
    assert.match(mailSource, /loadExternalImages: true[\s\S]*frame\.style\.height = "1px"[\s\S]*ResizeObserver[\s\S]*scrolling="no"/)
    assert.match(mailSource, /resolvedTheme[\s\S]*themeFamily[\s\S]*applyFrameTheme[\s\S]*requestAnimationFrame/)
    assert.match(mailSource, /getComputedStyle\(frame\)[\s\S]*applyMailDocumentTheme/)
    assert.doesNotMatch(mailSource, />Load external images</)
    const conversationBody = mailSource.slice(mailSource.indexOf("function ConversationBody"), mailSource.indexOf("function MailMessageActions"))
    assert.doesNotMatch(conversationBody, /overflow-y-auto/)
    assert.match(conversationBody, /latestMessageId[\s\S]*new Set\(\[latestMessageId\]\)/)
    assert.match(conversationBody, /aria-expanded=\{expanded\}/)
    assert.match(conversationBody, /data-mail-message-expanded=\{expanded \? "true" : "false"\}/)
    assert.match(conversationBody, /expanded \? \([\s\S]*<MailMessageBody/)
    assert.match(htmlSource, /DOMPurify\.sanitize/)
    assert.match(htmlSource, /data-zilobase-external-image/)
    assert.match(htmlSource, /default-src 'none'/)
  })

  test("background mail failures use a deduplicated toast instead of mailbox text", async () => {
    const mailSource = await readSource("/src/features/mail/pages/mail.tsx")

    assert.match(mailSource, /controller\.error[\s\S]*toast\.error\(getApiErrorMessage\(controller\.error\), \{ id: "mail-background-error" \}\)/)
    assert.doesNotMatch(mailSource, /controller\.error \? \(/)
  })

  test("mail organization controls are online-only and available at thread, message, and batch scope", async () => {
    const [mailSource, controllerSource] = await Promise.all([
      readSource("/src/features/mail/pages/mail.tsx"),
      readSource("/src/features/mail/model/mail-sync-controller.ts"),
    ])

    assert.match(mailSource, /batchSelection\.size[\s\S]*Mark selected read[\s\S]*Archive selected/)
    assert.match(mailSource, /function MailMessageActions[\s\S]*Move to spam[\s\S]*Move to trash/)
    assert.match(mailSource, /function MailLabelMenu[\s\S]*Create label[\s\S]*Rename[\s\S]*Delete label/)
    assert.match(mailSource, /disabled=\{!online \|\| mutating\}/)
    assert.match(controllerSource, /optimisticallyModifyThread[\s\S]*restoreMailMutation/)
    assert.match(controllerSource, /isDefiniteMailMutationFailure/)
  })
}
