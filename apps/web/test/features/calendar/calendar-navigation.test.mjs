export function register({ assert, loadModule, test }) {
  test("coverage composes snapshots, detects holes and treats empty intervals as loaded", async () => {
    const { missingCalendarRanges, coversCalendarRange } = await loadModule(
      "/src/features/calendar/sync/range-coverage.ts",
    );
    const at = (day) => `2026-09-${String(day).padStart(2, "0")}T00:00:00.000Z`;
    const windows = [
      { start: at(1), end: at(5) },
      { start: at(7), end: at(10) },
    ];
    assert.deepEqual(missingCalendarRanges(at(2), at(9), windows), [{ start: at(5), end: at(7) }]);
    assert.equal(coversCalendarRange(windows, { start: at(2), end: at(4) }), true);
    assert.equal(coversCalendarRange(windows, { start: at(4), end: at(8) }), false);
    assert.equal(
      coversCalendarRange([...windows, { start: at(5), end: at(7) }], {
        start: at(1),
        end: at(10),
      }),
      true,
    );
  });
  test("destination work overtakes queued prefetch and equal requests share one write", async () => {
    const { runCalendarSyncOnce } = await loadModule(
      "/src/features/calendar/sync/calendar-sync-queue.ts",
    );
    const db = { name: "priority-test" },
      order = [];
    let release;
    const first = runCalendarSyncOnce(
      db,
      "active",
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const background = runCalendarSyncOnce(db, "background", async () => order.push("background"));
    const destination = runCalendarSyncOnce(
      db,
      "destination",
      async () => order.push("destination"),
      10,
    );
    const duplicate = runCalendarSyncOnce(
      db,
      "destination",
      async () => order.push("duplicate"),
      10,
    );
    assert.equal(destination, duplicate);
    release();
    await Promise.all([first, background, destination]);
    assert.deepEqual(order, ["destination", "background"]);
  });
  test("navigation fetches only missing coverage and preserves events beyond a hole", async () => {
    const fake = await import("fake-indexeddb");
    globalThis.indexedDB = fake.indexedDB;
    globalThis.IDBKeyRange = fake.IDBKeyRange;
    const {
      openCalendarDatabase,
      applyCalendarRange,
      readCalendarRangeCache,
      destroyCalendarDatabase,
    } = await loadModule("/src/features/calendar/storage/calendar-database.ts");
    const { synchronizeCalendarCache } = await loadModule(
      "/src/features/calendar/sync/calendar-cache-sync.ts",
    );
    const db = await openCalendarDatabase({
      apiOrigin: "https://navigation.test",
      userId: "u",
      workspaceId: "w",
      bindingId: "b",
    });
    const at = (day) => `2026-09-${String(day).padStart(2, "0")}T00:00:00.000Z`;
    const calendar = { id: "c", bindingId: "b", timeZone: "UTC", permissions: { read: true } };
    const snapshot = (start, end, events = []) => ({
      calendarId: "c",
      start,
      end,
      generation: 1,
      revision: 1,
      events,
      complete: true,
      nextPageToken: null,
    });
    try {
      await db.calendars.put(calendar);
      await applyCalendarRange(db, snapshot(at(1), at(5)));
      await applyCalendarRange(
        db,
        snapshot(at(7), at(10), [
          {
            workspaceId: "w",
            bindingId: "b",
            calendarId: "c",
            eventId: "event",
            status: "confirmed",
            start: { date: "2026-09-08" },
            end: { date: "2026-09-09" },
          },
        ]),
      );
      const partial = await readCalendarRangeCache(db, "c", at(1), at(10));
      assert.equal(partial.loaded, false);
      assert.equal(partial.events.length, 1);
      const calls = [];
      await synchronizeCalendarCache(
        db,
        at(1),
        at(10),
        async (path) => {
          if (path.endsWith("/catalog")) return { calendars: [calendar] };
          const url = new URL(path, "https://navigation.test");
          calls.push([url.searchParams.get("start"), url.searchParams.get("end")]);
          return snapshot(...calls.at(-1));
        },
        false,
        { missingOnly: true },
      );
      assert.deepEqual(calls, [[at(5), at(7)]]);
      assert.equal((await readCalendarRangeCache(db, "c", at(1), at(10))).loaded, true);
    } finally {
      await destroyCalendarDatabase(db.name);
    }
  });
  test("chrome date prefers settled viewport over the route bookmark", async () => {
    const { chromeCalendarDate } = await loadModule(
      "/src/features/calendar/workspace/calendar-navigation.ts",
    );
    assert.equal(chromeCalendarDate("2026-10-20", "2026-09-09", "UTC"), "2026-10-20");
    assert.equal(chromeCalendarDate(null, "2026-09-09", "UTC"), "2026-09-09");
  });
  test("readiness requires each visible account and rejects another user's snapshot", async () => {
    const { calendarRangeReady } = await loadModule(
      "/src/features/calendar/sync/range-coverage.ts",
    );
    const range = { start: "2026-09-01T00:00:00Z", end: "2026-10-01T00:00:00Z" };
    const connections = [
      { workspaceId: "w", bindingId: "a" },
      { workspaceId: "w2", bindingId: "b" },
    ];
    const snapshot = (c, ranges) => ({
      requestKey: JSON.stringify(["user", c.workspaceId, c.bindingId, range.start]),
      catalogLoaded: true,
      calendars: [
        { id: "primary", bindingId: c.bindingId, permissions: { read: true, freeBusyOnly: false } },
      ],
      coverage: [{ calendarId: "primary", ranges }],
    });
    const snapshots = { a: snapshot(connections[0], [range]), b: snapshot(connections[1], []) };
    const preferences = { hiddenCalendarKeys: [] };
    assert.equal(calendarRangeReady(connections, snapshots, "user", preferences, range), false);
    assert.equal(
      calendarRangeReady(
        connections,
        snapshots,
        "user",
        { hiddenCalendarKeys: [JSON.stringify(["b", "primary"])] },
        range,
      ),
      true,
    );
    snapshots.b.coverage[0].ranges = [range];
    assert.equal(calendarRangeReady(connections, snapshots, "user", preferences, range), true);
    assert.equal(
      calendarRangeReady(connections, snapshots, "other-user", preferences, range),
      false,
    );
    snapshots.b.coverage = [];
    snapshots.b.calendars[0].permissions.freeBusyOnly = true;
    assert.equal(calendarRangeReady(connections, snapshots, "user", preferences, range), true);
  });
}
