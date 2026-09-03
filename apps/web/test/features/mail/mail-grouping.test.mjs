export function register({ assert, readSource, readWorkspace, test }) {
  test("mail grouping persists configuration and renders full-index group counts", async () => {
    const [editor, groupsHook, page, routes] = await Promise.all([
      readSource("/src/features/mail/components/mail-group-editor.tsx"),
      readWorkspace("/packages/features/src/mail/queries.ts"),
      readSource("/src/features/mail/pages/mail.tsx"),
      readWorkspace("/apps/server/src/features/mail/routes.ts"),
    ])

    for (const label of ["Date", "Starred", "Important", "Email", "Email domain", "Priority", "Label", "Unread"]) {
      assert.ok(editor.includes(`label: "${label}"`), `missing ${label}`)
    }
    assert.match(page, /value: \{ config: \{ \.\.\.activePersistedView\.config, group \} \}/)
    assert.match(groupsHook, /\/query\/groups/)
    assert.match(routes, /post\("\/query\/groups"/)
    assert.match(page, /mailGroupsQuery\.data\?\.groups/)
    assert.match(page, /aria-expanded=\{!collapsedGroups\.has\(key\)\}/)
    assert.match(editor, /group && group\.propertyId !== "starred"/)
    assert.match(page, /propertyId === "starred"[\s\S]*Number\(right\.key === "true"\)/)
    assert.match(page, /"Starred" : "Everything else"/)
  })

  test("mail group drag updates only mutable Gmail-backed groups", async () => {
    const [editor, page] = await Promise.all([
      readSource("/src/features/mail/components/mail-group-editor.tsx"),
      readSource("/src/features/mail/pages/mail.tsx"),
    ])

    assert.match(editor, /\["date", "received_date", "from", "email_domain"\]/)
    assert.match(page, /application\/x-zilobase-mail-thread/)
    assert.match(page, /propertyId === "starred"/)
    assert.match(page, /propertyId === "unread"/)
    assert.match(page, /propertyId === "important" \|\| propertyId === "priority"/)
    assert.match(page, /propertyId === "labels"/)
  })
}
