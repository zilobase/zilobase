export function register({ assert, loadModule, test }) {
  test("notion import is disabled unless config enables it", async () => {
    const { isFeatureEnabled } = await loadModule("/src/config/feature-flags.ts")

    assert.equal(isFeatureEnabled("notionImport"), false)
  })

  test("readBooleanFeatureFlag accepts common boolean config values", async () => {
    const { readBooleanFeatureFlag } = await loadModule(
      "/src/config/feature-flags.ts",
    )

    assert.equal(readBooleanFeatureFlag("true"), true)
    assert.equal(readBooleanFeatureFlag("1"), true)
    assert.equal(readBooleanFeatureFlag("yes"), true)
    assert.equal(readBooleanFeatureFlag("on"), true)
    assert.equal(readBooleanFeatureFlag("false", true), false)
    assert.equal(readBooleanFeatureFlag("0", true), false)
    assert.equal(readBooleanFeatureFlag("no", true), false)
    assert.equal(readBooleanFeatureFlag("off", true), false)
    assert.equal(readBooleanFeatureFlag(undefined, true), true)
    assert.equal(readBooleanFeatureFlag("unexpected", false), false)
  })
}
