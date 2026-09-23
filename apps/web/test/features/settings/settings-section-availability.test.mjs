export function register({ assert, loadModule, test }) {
  test("mail and calendar settings stay hidden without their server environment", async () => {
    const { isSettingsSectionAvailable } = await loadModule(
      "/src/features/settings/model/settings-section-availability.ts",
    )
    const unavailable = { mail: false, calendar: false }

    assert.equal(isSettingsSectionAvailable("mail", unavailable), false)
    assert.equal(isSettingsSectionAvailable("calendar", unavailable), false)
    assert.equal(isSettingsSectionAvailable("preferences", unavailable), true)
    assert.equal(isSettingsSectionAvailable("mail", { mail: true, calendar: false }), true)
    assert.equal(isSettingsSectionAvailable("calendar", { mail: false, calendar: true }), true)
  })
}
