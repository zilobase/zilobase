export function register({ assert, loadModule, test }) {
  test("overlapping calendar requests share delivery and isolate cancellation", async () => {
    const { requestCalendarIntervals } = await loadModule(
      "/src/features/calendar/sync/calendar-range-queue.ts",
    );
    const calls = [];
    let release;
    const barrier = new Promise((resolve) => {
      release = resolve;
    });
    const run = async (range) => {
      calls.push([range.start, range.end]);
      await barrier;
    };
    const signal = new AbortController();
    const a = requestCalendarIntervals(
      "overlap",
      "account",
      { start: "2026-09-01", end: "2026-09-10" },
      run,
      10,
      signal.signal,
    );
    const b = requestCalendarIntervals(
      "overlap",
      "account",
      { start: "2026-09-05", end: "2026-09-12" },
      run,
      10,
    );
    signal.abort();
    await assert.rejects(a, { name: "AbortError" });
    release();
    await b;
    assert.equal(calls.length, 2);
    assert.equal(calls[1][0].slice(0, 10), "2026-09-10");
  });
  test("range queue reserves foreground capacity and aborts unused reads", async () => {
    const { requestCalendarIntervals } = await loadModule(
      "/src/features/calendar/sync/calendar-range-queue.ts",
    );
    const started = [];
    const releases = [];
    const run = async (_range, signal) =>
      new Promise((resolve, reject) => {
        started.push(signal);
        releases.push(resolve);
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("cancelled", "AbortError")),
          { once: true },
        );
      });
    const range = { start: "2026-09-01", end: "2026-09-02" };
    const a = requestCalendarIntervals("capacity-a", "capacity", range, run);
    const b = requestCalendarIntervals("capacity-b", "capacity", range, run);
    const c = requestCalendarIntervals("capacity-c", "capacity", range, run, 10);
    assert.equal(started.length, 2);
    releases.shift()();
    releases.shift()();
    await Promise.all([a, c]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(started.length, 3);
    releases.shift()();
    await b;
    const controller = new AbortController();
    const last = requestCalendarIntervals(
      "cancel-unused",
      "unused",
      range,
      run,
      10,
      controller.signal,
    );
    controller.abort();
    await assert.rejects(last, { name: "AbortError" });
    assert.equal(started.at(-1).aborted, true);
  });
  test("Calendar snapshots reject partial and cross-account data and keep empty coverage", async () => {
    const fake = await import("fake-indexeddb");
    globalThis.indexedDB = fake.indexedDB;
    globalThis.IDBKeyRange = fake.IDBKeyRange;
    const {
      openCalendarDatabase,
      applyCalendarRange,
      readCalendarRangeCache,
      destroyCalendarDatabase,
    } = await loadModule("/src/features/calendar/storage/calendar-database.ts");
    const identity = {
      apiOrigin: "https://calendar-cache.example",
      userId: "user",
      workspaceId: "workspace",
      bindingId: "binding",
    };
    const a = await openCalendarDatabase(identity),
      b = await openCalendarDatabase({ ...identity, bindingId: "second" });
    const response = {
      calendarId: "c",
      start: "2026-09-01T00:00:00Z",
      end: "2026-10-01T00:00:00Z",
      generation: 1,
      revision: 2,
      events: [],
      complete: true,
      nextPageToken: null,
    };
    try {
      assert.equal(
        await applyCalendarRange(a, { ...response, complete: false, nextPageToken: "next" }),
        false,
      );
      assert.equal(
        (await readCalendarRangeCache(a, "c", response.start, response.end)).loaded,
        false,
      );
      assert.equal(await applyCalendarRange(a, response), true);
      assert.equal(
        (await readCalendarRangeCache(a, "c", response.start, response.end)).loaded,
        true,
      );
      assert.equal(await applyCalendarRange(a, { ...response, revision: 1 }), false);
      await assert.rejects(() =>
        applyCalendarRange(a, {
          ...response,
          events: [
            {
              workspaceId: "workspace",
              bindingId: "second",
              calendarId: "c",
              eventId: "e",
              status: "confirmed",
            },
          ],
        }),
      );
      assert.equal(
        (await readCalendarRangeCache(a, "c", "2026-09-09T00:00:00Z", "2026-09-10T00:00:00Z"))
          .loaded,
        true,
      );
      assert.equal(
        (await readCalendarRangeCache(a, "c", "2026-09-30T00:00:00Z", "2026-10-02T00:00:00Z"))
          .loaded,
        false,
      );
      const event = {
        workspaceId: "workspace",
        bindingId: "binding",
        calendarId: "c",
        eventId: "removed",
        status: "confirmed",
        start: { date: "2026-09-09" },
        end: { date: "2026-09-10" },
      };
      await applyCalendarRange(a, { ...response, revision: 3, events: [event] });
      await applyCalendarRange(a, {
        ...response,
        start: "2026-09-08T00:00:00Z",
        end: "2026-09-11T00:00:00Z",
        revision: 4,
      });
      assert.equal(
        (await readCalendarRangeCache(a, "c", response.start, response.end)).events.length,
        0,
      );
      assert.equal(b.isOpen(), true);
      await destroyCalendarDatabase(a.name);
      assert.equal(b.isOpen(), true);
    } finally {
      await destroyCalendarDatabase(a.name);
      await destroyCalendarDatabase(b.name);
    }
  });
  test("Calendar queues coalesce equal requests and serialize different ranges", async () => {
    const { runCalendarSyncOnce } = await loadModule(
      "/src/features/calendar/sync/calendar-sync-queue.ts",
    );
    const sequence = [];
    let release;
    const barrier = new Promise((resolve) => {
      release = resolve;
    });
    const database = { name: "queue-fixture" };
    const first = runCalendarSyncOnce(database, "a", async () => {
      sequence.push("a");
      await barrier;
      return 1;
    });
    const duplicate = runCalendarSyncOnce(database, "a", async () => {
      throw new Error("not coalesced");
    });
    const next = runCalendarSyncOnce(database, "b", async () => {
      sequence.push("b");
      return 2;
    });
    assert.equal(first, duplicate);
    release();
    assert.deepEqual(await Promise.all([first, next]), [1, 2]);
    assert.deepEqual(sequence, ["a", "b"]);
  });
  test("Calendar invalidations refresh cached metadata and remove deleted calendars without provider polling", async () => {
    const fake = await import("fake-indexeddb");
    globalThis.indexedDB = fake.indexedDB;
    globalThis.IDBKeyRange = fake.IDBKeyRange;
    const { openCalendarDatabase, applyCalendarRange, destroyCalendarDatabase } = await loadModule(
      "/src/features/calendar/storage/calendar-database.ts",
    );
    const { synchronizeCalendarCache } = await loadModule(
      "/src/features/calendar/sync/calendar-cache-sync.ts",
    );
    const database = await openCalendarDatabase({
      apiOrigin: "https://calendar-catalog.example",
      userId: "user",
      workspaceId: "workspace",
      bindingId: "binding",
    });
    const range = {
      calendarId: "deleted",
      start: "2026-09-01T00:00:00Z",
      end: "2026-10-01T00:00:00Z",
      generation: 1,
      revision: 1,
      events: [],
      complete: true,
      nextPageToken: null,
    };
    try {
      await database.calendars.put({
        id: "deleted",
        bindingId: "binding",
        permissions: { read: true },
      });
      await applyCalendarRange(database, range);
      const requests = [];
      await synchronizeCalendarCache(
        database,
        range.start,
        range.end,
        async (path) => {
          requests.push(path);
          return { calendars: [] };
        },
        false,
      );
      assert.equal(requests.length, 1);
      assert.equal(requests[0].endsWith("/catalog"), true);
      assert.equal(await database.calendars.count(), 0);
      assert.equal(await database.ranges.count(), 0);
    } finally {
      await destroyCalendarDatabase(database.name);
    }
  });

  test("moving month windows request contiguous ranges below the provider limit", async () => {
    const fake = await import("fake-indexeddb");
    globalThis.indexedDB = fake.indexedDB;
    globalThis.IDBKeyRange = fake.IDBKeyRange;
    const { openCalendarDatabase, destroyCalendarDatabase } = await loadModule(
      "/src/features/calendar/storage/calendar-database.ts",
    );
    const { synchronizeCalendarCache } = await loadModule(
      "/src/features/calendar/sync/calendar-cache-sync.ts",
    );
    const database = await openCalendarDatabase({
      apiOrigin: "https://calendar-ranges.example",
      userId: "user",
      workspaceId: "workspace",
      bindingId: "binding",
    });
    const start = "2026-08-02T18:30:00.000Z",
      end = "2026-11-22T18:30:00.000Z";
    try {
      await database.calendars.put({ id: "c", bindingId: "binding", permissions: { read: true } });
      const ranges = [];
      await synchronizeCalendarCache(
        database,
        start,
        end,
        async (path) => {
          const query = path.split("?")[1];
          if (!query) return { calendars: [] };
          const params = new URLSearchParams(query);
          ranges.push({ start: params.get("start"), end: params.get("end") });
          return {
            calendarId: "c",
            start: params.get("start"),
            end: params.get("end"),
            generation: 1,
            revision: 1,
            events: [],
            complete: true,
            nextPageToken: null,
          };
        },
        false,
        { metadataLoaded: true },
      );
      assert.equal(ranges.length, 4);
      assert.equal(ranges[0].start, start);
      assert.equal(ranges.at(-1).end, end);
      assert.equal(ranges[0].end, ranges[1].start);
      for (const range of ranges)
        assert.ok(Date.parse(range.end) - Date.parse(range.start) <= 62 * 86400000);
    } finally {
      await destroyCalendarDatabase(database.name);
    }
  });
}
