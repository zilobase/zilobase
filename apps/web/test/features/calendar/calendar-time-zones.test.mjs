export function register({ assert, loadModule, test }) {
  test("timezone edits preserve primary-first storage, reject aliases and never truncate saved travel", async () => {
    const { withZoneColumns, saveTravelZone, zoneDescription } = await loadModule("/src/features/calendar/preferences/time-zone-model.ts");
    const value = { timeZone: "Asia/Kolkata", timeZoneColumns: [{ zone: "Asia/Kolkata", label: "Home" }] };
    assert.throws(() => withZoneColumns(value, [...value.timeZoneColumns, { zone: "Asia/Calcutta", label: "Duplicate" }]));
    const next = saveTravelZone(value, "Europe/London", true);
    assert.equal(next.timeZone, "Europe/London");
    assert.equal(next.timeZoneColumns[1].label, "Home");
    assert.equal(value.timeZone, "Asia/Kolkata");
    const four = withZoneColumns(value, ["Asia/Kolkata", "Europe/London", "UTC", "America/New_York"].map(zone => ({ zone, label: zone })));
    assert.throws(() => saveTravelZone(four, "Asia/Tokyo", true));
    assert.equal(zoneDescription("Asia/Kolkata", new Date("2026-09-10T00:00:00Z")).offset, "GMT+05:30");
    assert.notEqual(zoneDescription("Europe/London", new Date("2026-01-10T00:00:00Z")).offset, zoneDescription("Europe/London", new Date("2026-07-10T00:00:00Z")).offset);
  });
}
