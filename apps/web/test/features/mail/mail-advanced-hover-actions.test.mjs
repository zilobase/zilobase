export function register({ assert, readSource, readWorkspace, test }) {
  test("advanced hover actions connect reminders, commands, labels, reply, and unsubscribe", async () => {
    const [page, dialog, reminders, routes] = await Promise.all([
      readSource("/src/features/mail/pages/mail.tsx"),
      readSource("/src/features/mail/components/mail-row-action-dialog.tsx"),
      readSource("/src/features/mail/model/use-mail-reminders.ts"),
      readWorkspace("/apps/server/src/features/mail/routes.ts"),
    ])
    assert.match(dialog, /Mail commands/)
    assert.match(dialog, /Apply a label/)
    assert.match(page, /replySeed\(latest, connection\.email!/)
    assert.match(page, /mailReminders\.schedule/)
    assert.match(page, /window\.confirm/)
    assert.match(page, /noopener,noreferrer/)
    assert.match(reminders, /reminders\/advance/)
    assert.match(reminders, /window\.setTimeout/)
    assert.match(routes, /inspectOrExecuteUnsubscribe/)
  })

  test("unsubscribe validation checks DNS, redirects, credentials, and private networks", async () => {
    const source = await readWorkspace("/apps/server/src/features/mail/safe-unsubscribe.ts")
    assert.match(source, /cloudflare-dns\.com\/dns-query/)
    assert.match(source, /redirect: "manual"/)
    assert.match(source, /MAX_REDIRECTS/)
    assert.match(source, /url\.username \|\| url\.password/)
    for (const address of ["127", "169", "172", "192", "::1"]) assert.ok(source.includes(address))
  })
}
