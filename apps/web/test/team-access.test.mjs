const MINUTE_IN_MS = 60_000;
const DAY_IN_MS = 24 * 60 * MINUTE_IN_MS;

export function register({ assert, loadModule, test }) {
  test("temporary access date helpers round-trip local date-time values", async () => {
    const { isoToLocalDateTime, localDateTimeToIso } = await loadModule(
      "/src/pages/settings/team-access.ts",
    );
    const iso = "2030-04-05T12:34:00.000Z";

    assert.equal(localDateTimeToIso(isoToLocalDateTime(iso)), iso);
    assert.equal(localDateTimeToIso(""), null);
    assert.equal(localDateTimeToIso("not-a-date"), null);
    assert.equal(isoToLocalDateTime("not-a-date"), "");
  });

  test("temporary access defaults and limits use the expected windows", async () => {
    const {
      getDefaultTemporaryExpiration,
      getMaximumTemporaryExpiration,
      getMinimumTemporaryExpiration,
      localDateTimeToIso,
    } = await loadModule("/src/pages/settings/team-access.ts");
    const now = Date.parse("2030-01-01T10:00:00.000Z");
    const toTimestamp = (value) => Date.parse(localDateTimeToIso(value));

    assert.equal(toTimestamp(getMinimumTemporaryExpiration(now)), now + MINUTE_IN_MS);
    assert.equal(toTimestamp(getDefaultTemporaryExpiration(now)), now + 30 * DAY_IN_MS);
    assert.equal(toTimestamp(getMaximumTemporaryExpiration(now)), now + 365 * DAY_IN_MS);
  });

  test("workspace role normalization recognizes temporary access", async () => {
    const { normalizeWorkspaceRole } = await loadModule(
      "/src/pages/settings/team-access.ts",
    );

    assert.equal(normalizeWorkspaceRole("temporary"), "temporary");
    assert.equal(normalizeWorkspaceRole("owner"), "owner");
    assert.equal(normalizeWorkspaceRole("guest"), null);
  });
}
