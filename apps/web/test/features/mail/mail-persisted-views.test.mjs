import { readMailFeatureSource } from "./mail-feature-source.mjs"

export function register({ assert, readSource, readWorkspace, test }) {
  test("Mail bootstraps persisted views for the active workspace binding", async () => {
    const [hook, page] = await Promise.all([
      readWorkspace("/packages/features/src/mail/hooks.ts"),
      readMailFeatureSource(readSource),
    ])

    assert.match(hook, /mailApiBasePath\(input\.workspaceId\)/)
    assert.match(hook, /\$\{basePath\}\/views/)
    assert.match(hook, /mailKeys\.views\(input\)/)
    assert.match(page, /useMailViews\(\{/)
    assert.match(page, /enabled: true/)
    assert.doesNotMatch(page, /mailOrganization/)
  })

  test("Mail advances bounded index work and reports progress", async () => {
    const page = await readMailFeatureSource(readSource)

    assert.match(page, /\/index\/advance/)
    assert.match(page, /Indexing full mailbox…/)
    assert.match(page, /indexProgress\.indexedThreadCount/)
    assert.match(page, /Mail indexing paused/)
  })
}
