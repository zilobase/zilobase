export function register({ assert, readSource, test }) {
  test("page collaboration prepares one document through deferred startup", async () => {
    const source = await readSource(
      "/src/features/editor/collaboration/use-page-collaboration.ts",
    )

    assert.match(
      source,
      /const cancelPreparation = scheduleRealtimeAfterPagePaint\(\(\) => void prepare\(\)\)/,
    )
    assert.equal(
      source.match(/^\s*void prepare\(\)\s*$/gm)?.length ?? 0,
      0,
      "preparing immediately as well as through the scheduler creates two Yjs documents",
    )
  })
}
