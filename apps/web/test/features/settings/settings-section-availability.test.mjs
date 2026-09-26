export function register({ assert, loadModule, test }) {
  test("calendar settings stay hidden without their server environment", async () => {
    const { isSettingsSectionAvailable } = await loadModule(
      "/src/features/settings/model/settings-section-availability.ts",
    );
    const unavailable = { calendar: false };

    assert.equal(isSettingsSectionAvailable("calendar", unavailable), false);
    assert.equal(isSettingsSectionAvailable("preferences", unavailable), true);
    assert.equal(isSettingsSectionAvailable("calendar", { calendar: true }), true);
  });
}
