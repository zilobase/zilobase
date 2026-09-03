import { readMailFeatureSource } from "./mail-feature-source.mjs"

export function register({ assert, readSource, readWorkspace, test }) {
  test("Mail uses opaque indexed pagination for persisted and system routes", async () => {
    const [hook, page] = await Promise.all([
      readWorkspace("/packages/features/src/mail/queries.ts"),
      readMailFeatureSource(readSource),
    ])

    assert.match(hook, /infiniteQueryOptions/)
    assert.match(hook, /lastPage\.nextCursor/)
    assert.match(hook, /mailApiBasePath\(scope\.workspaceId\)\}\/query/)
    assert.match(hook, /routeId: scope\.routeId/)
    assert.match(hook, /search: scope\.search/)
    assert.match(page, /useIndexedMailView\(\{/)
    assert.match(page, /indexedMailQuery\.fetchNextPage\(\)/)
    assert.match(page, /page\.threads\.map\(\(indexed\) => indexed\.thread\)/)
  })

  test("Dexie and server filtering share the same predicate evaluator", async () => {
    const controller = await readSource(
      "/src/features/mail/model/mail-sync-controller.ts",
    )

    assert.match(controller, /evaluateMailFilterExpression/)
    assert.match(controller, /mailFilterRecordFromThreadSummary/)
    assert.match(controller, /input\.filter/)
  })
}
