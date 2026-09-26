export function register({ assert, readSource, test }) {
  test("Calendar settings use the canonical settings layout", async () => {
    const [calendarPage, calendarPreferences] = await Promise.all([
      readSource("/src/features/settings/screens/calendar.tsx"),
      readSource("/src/features/calendar/preferences/calendar-settings.tsx"),
    ]);

    assert.match(calendarPage, /<SettingsPage/);
    assert.match(calendarPage, /<SettingsSection/);
    assert.match(calendarPage, /<SettingsRow/);
    assert.match(calendarPreferences, /<SettingsSectionLayout/);
    assert.match(calendarPreferences, /<SettingsRow/);
  });

  test("edition settings receive the same host layout components", async () => {
    const [content, contract, layout] = await Promise.all([
      readSource("/src/app/shell/content/settings-section-content.tsx"),
      readSource("/src/edition/community.ts"),
      readSource("/src/features/settings/components/settings-layout.tsx"),
    ]);

    assert.match(content, /<EditionSettings settingsUi=\{settingsUi\} \/>/);
    assert.match(contract, /settingsUi\?: EditionSettingsUi/);
    assert.match(layout, /export const settingsUi: SettingsUi/);
  });
}
