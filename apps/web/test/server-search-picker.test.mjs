import { fileURLToPath } from "node:url"

const searchQueriesPath = fileURLToPath(
  new URL(
    "../../../packages/features/src/search/queries.ts",
    import.meta.url,
  ),
)

export function register({ assert, loadModule, test }) {
  test("sidebar picker searches one item type on the server", async () => {
    const { appSearchQueryOptions } = await loadModule(searchQueriesPath)
    let requestedPath = ""
    const options = appSearchQueryOptions(
      async (path) => {
        requestedPath = path
        return { results: [] }
      },
      "workspace-1",
      "project plan",
      true,
      ["page"],
    )

    await options.queryFn({ signal: new AbortController().signal })

    assert.equal(
      requestedPath,
      "/search?workspaceId=workspace-1&q=project+plan&types=page",
    )
    assert.deepEqual(options.queryKey, [
      "search",
      "workspace-1",
      "project plan",
      "page",
    ])
  })
}
