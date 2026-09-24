export function register({ assert, loadModule, test }) {
  test("Calendar reminders recover after sleep, suppress ended events, and atomically deduplicate", async () => {
    const fake = await import("fake-indexeddb");
    globalThis.indexedDB = fake.indexedDB;
    globalThis.IDBKeyRange = fake.IDBKeyRange;
    const { openCalendarDatabase, applyCalendarRange, destroyCalendarDatabase } = await loadModule(
      "/src/features/calendar/storage/calendar-database.ts",
    );
    const { dueCalendarReminders, claimCalendarReminder } = await loadModule(
      "/src/features/calendar/reminders/scheduler.ts",
    );
    const event = {
      workspaceId: "w",
      bindingId: "b",
      calendarId: "c",
      eventId: "e",
      title: "Meeting",
      start: { dateTime: "2026-09-09T10:00:00Z", timeZone: "UTC" },
      end: { dateTime: "2026-09-09T11:00:00Z", timeZone: "UTC" },
      status: "confirmed",
      attendees: [],
      reminders: { useDefault: true },
    };
    const calendars = [
      { id: "c", timeZone: "UTC", defaultReminders: [{ method: "popup", minutes: 10 }] },
    ];
    const now = Date.parse("2026-09-09T10:05:00Z"),
      started = Date.parse("2026-09-09T09:00:00Z");
    const due = dueCalendarReminders([event], calendars, now, started);
    assert.equal(due.length, 1);
    assert.equal(dueCalendarReminders([event], calendars, now + 3600000, started).length, 0);
    assert.equal(
      dueCalendarReminders([{ ...event, status: "cancelled" }], calendars, now, started).length,
      0,
    );
    assert.equal(
      dueCalendarReminders(
        [{ ...event, reminders: { useDefault: false, overrides: [] } }],
        calendars,
        now,
        started,
      ).length,
      0,
    );
    const db = await openCalendarDatabase({
      apiOrigin: "https://reminder.test",
      userId: "u",
      workspaceId: "w",
      bindingId: "b",
    });
    try {
      await applyCalendarRange(db, {
        calendarId: "c",
        start: "2026-09-09T00:00:00Z",
        end: "2026-09-10T00:00:00Z",
        generation: 1,
        revision: 1,
        events: [event],
        complete: true,
        nextPageToken: null,
      });
      assert.deepEqual(
        await Promise.all([
          claimCalendarReminder(db, due[0], now),
          claimCalendarReminder(db, due[0], now),
        ]),
        [true, false],
      );
      const edited = { ...event, start: { ...event.start, dateTime: "2026-09-09T10:10:00Z" } };
      assert.notEqual(dueCalendarReminders([edited], calendars, now, started)[0].key, due[0].key);
    } finally {
      await destroyCalendarDatabase(db.name);
    }
  });
}
