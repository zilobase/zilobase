export function register({ assert, loadModule, test }) {
  test("bounded cache windows match full-query ordering on small and large mailboxes", async () => {
    const fake = await import("fake-indexeddb");
    globalThis.indexedDB = fake.indexedDB;
    globalThis.IDBKeyRange = fake.IDBKeyRange;
    const { readCachedMailThreads } = await loadModule(
      "/src/features/mail/storage/mail-cache-query.ts",
    );
    const { openMailDatabase, destroyMailDatabase } = await loadModule(
      "/src/features/mail/storage/mail-database.ts",
    );
    for (const size of [100, 10000]) {
      const db = await openMailDatabase({
        apiOrigin: "https://cache-query.test",
        bindingId: String(size),
        connectionId: "c",
        userId: "u",
        workspaceId: "w",
      });
      try {
        const rows = Array.from({ length: size }, (_, index) => ({
          id: String(index),
          internalDate: index,
          labelIds: index % 2 ? ["INBOX"] : ["SENT"],
          subject: "Fixture",
          snippet: "",
          participants: [],
        }));
        await db.threads.bulkPut(rows);
        const start = performance.now();
        const page = await readCachedMailThreads(db, "inbox", 51);
        const boundedMs = performance.now() - start;
        const fullStart = performance.now();
        const all = await db.threads.orderBy("internalDate").reverse().toArray();
        const fullMs = performance.now() - fullStart;
        assert.deepEqual(
          page.map((row) => row.id),
          all
            .filter((row) => row.labelIds.includes("INBOX"))
            .slice(0, 51)
            .map((row) => row.id),
        );
        console.log(
          `mail cache fixture: ${size} rows; bounded=${boundedMs.toFixed(1)}ms (${page.length} materialized); full=${fullMs.toFixed(1)}ms (${all.length} materialized)`,
        );
      } finally {
        await destroyMailDatabase(db.name);
      }
    }
  });
}
