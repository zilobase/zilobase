import { readFile } from "node:fs/promises";

const MINUTE_IN_MS = 60_000;
const DAY_IN_MS = 24 * 60 * MINUTE_IN_MS;

export function register({ readSource, assert, loadModule, test }) {
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

  test("team settings tabs normalize deep links", async () => {
    const { normalizeTeamSettingsTab } = await loadModule(
      "/src/pages/settings/team-settings-tabs.ts",
    );

    assert.equal(normalizeTeamSettingsTab("team"), "team");
    assert.equal(normalizeTeamSettingsTab("guests"), "guests");
    assert.equal(normalizeTeamSettingsTab("unknown"), "team");
    assert.equal(normalizeTeamSettingsTab(undefined), "team");
  });

  test("team settings can open from the settings dialog on any route", async () => {
    const source = await readSource("/src/pages/settings/team.tsx");

    assert.match(source, /useSearch\(\{\s*strict: false,/);
    assert.match(source, /normalizeTeamSettingsTab\(search\.tab\)/);
    assert.doesNotMatch(source, /useSearch\(\{ from: "\/app\/settings\/team" \}\)/);
  });

  test("team settings tab counts include pending work", async () => {
    const { getTeamSettingsTabCounts } = await loadModule(
      "/src/pages/settings/team-settings-tabs.ts",
    );

    assert.deepEqual(
      getTeamSettingsTabCounts({
        guests: 2,
        members: 4,
        pendingGuestRequests: 3,
        pendingInvitations: 1,
      }),
      { guests: 5, team: 5 },
    );
  });
}
