export function register({ assert, loadModule, readSource, test }) {
  test("Mail is a fixed default sidebar tab with complete folder shortcuts", async () => {
    const { defaultSidebarWorkspaceLayout, mailViewIds, normalizeSidebarWorkspaceLayout } = await loadModule(
      "/packages/features/src/user-settings/sidebar-config.ts",
    )
    const mail = defaultSidebarWorkspaceLayout.tabs[1]

    assert.equal(mail.id, "mail")
    assert.equal(mail.name, "Mail")
    assert.equal(mail.icon, "mail")
    assert.deepEqual(mail.shortcuts.slice(1).map((shortcut) => shortcut.target.view), mailViewIds)
    assert.deepEqual(mail.shortcuts[0].target, { action: "composeMail", type: "action" })

    const normalized = normalizeSidebarWorkspaceLayout({
      tabs: [{ icon: "home", id: "home", name: "Home", sections: [], shortcuts: [] }],
      taskDatabaseIds: [],
    })
    assert.equal(normalized.tabs[1].id, "mail")
  })

  test("Mail route uses grouped list rows and compact page spacing", async () => {
    const [routeSource, mailSource] = await Promise.all([
      readSource("/src/app/routing/route-groups/app-routes.tsx"),
      readSource("/src/features/mail/pages/mail.tsx"),
    ])

    assert.match(routeSource, /path: "\/mail"[\s\S]*validateSearch: validateMailSearch[\s\S]*component: MailPage/)
    assert.match(mailSource, /px-4 pb-8 pt-5 sm:px-6 md:px-10 lg:px-12/)
    assert.match(mailSource, /messageGroups\s*\.map/)
    assert.match(mailSource, /<MailRow/)
    assert.doesNotMatch(mailSource, /<table|DatabaseTableView/)
    assert.doesNotMatch(mailSource, /group\/mail-row[^\n]*border-b/)
    assert.match(mailSource, /group\/mail-row grid h-9/)
    assert.doesNotMatch(mailSource, /getInitials|avatarClassName/)
    assert.doesNotMatch(mailSource, /primaryViews|aria-label="Mail views"|visibleMessages\.length/)
    assert.match(mailSource, /aria-label="Refresh mail"[\s\S]*aria-label="Mail display options"/)
    assert.match(mailSource, /justify-between[\s\S]*ActiveViewIcon[\s\S]*text-xl[\s\S]*mailViewLabels\[view\][\s\S]*aria-label="Search mail"/)
    assert.match(mailSource, /ActiveViewIcon className="size-5/)
    assert.doesNotMatch(mailSource, /A calm place for conversations/)
    assert.match(mailSource, /<h3 className="px-2/)
    assert.doesNotMatch(mailSource, /border-b border-stroke-default pb-2|<PlusIcon \/>[\s\S]*Compose/)
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
}
