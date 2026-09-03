import { readMailFeatureSource } from "./mail-feature-source.mjs"

export function register({ assert, loadModule, readSource, readWorkspace, test }) {
  test("mail view helpers preserve filter counts and stable group ordering", async () => {
    const model = await loadModule("/src/features/mail/model/mail-view-model.ts")

    const filter = {
      filters: [
        { operator: "is", propertyId: "mailbox", type: "condition", values: ["inbox"] },
        { filters: [{ operator: "contains", propertyId: "subject", type: "condition", values: ["roadmap"] }], type: "group" },
      ],
      operator: "and",
      type: "group",
    }
    assert.equal(model.countMailFilterConditions(filter), 2)
    assert.equal(model.countMailFilterConditions(filter, true), 1)
    assert.equal(model.providerViewForOrganizationRoute(null, "sent"), "sent")
    assert.equal(model.providerViewForOrganizationRoute({ templateId: "unread" }, null), "unread")
    assert.equal(model.providerViewForOrganizationRoute({ templateId: "custom" }, null), "inbox")
    assert.equal(model.isMutableMailGroup("labels"), true)
    assert.equal(model.isMutableMailGroup("email_domain"), false)

    const threads = [
      { id: "read", internalDate: 1, labelIds: [], participants: [], starred: false },
      { id: "starred", internalDate: 2, labelIds: ["STARRED"], participants: [], starred: true },
    ]
    const groups = model.groupMailThreads(
      threads,
      { direction: "descending", hideEmptyGroups: true, propertyId: "starred" },
      [],
      [],
      [],
      new Map(),
    )
    assert.deepEqual(groups.map(({ key, label, threads: grouped }) => ({ key, label, threadIds: grouped.map((thread) => thread.id) })), [
      { key: "true", label: "Starred", threadIds: ["starred"] },
      { key: "false", label: "Everything else", threadIds: ["read"] },
    ])
  })

  test("mail grouping persists configuration and renders full-index group counts", async () => {
    const [editor, groupsHook, page, routes] = await Promise.all([
      readSource("/src/features/mail/components/mail-group-editor.tsx"),
      readWorkspace("/packages/features/src/mail/queries.ts"),
      readMailFeatureSource(readSource),
      readWorkspace("/apps/server/src/features/mail/query-routes.ts"),
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
      readMailFeatureSource(readSource),
    ])

    assert.match(page, /\["date", "received_date", "from", "email_domain"\]/)
    assert.match(page, /application\/x-zilobase-mail-thread/)
    assert.match(page, /propertyId === "starred"/)
    assert.match(page, /propertyId === "unread"/)
    assert.match(page, /propertyId === "important" \|\| propertyId === "priority"/)
    assert.match(page, /propertyId === "labels"/)
  })
}
