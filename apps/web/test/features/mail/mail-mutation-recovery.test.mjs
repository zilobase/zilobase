export function register({ assert, loadModule, test }) {
  test("cursor recovery preserves other folders and queues their verification", async () => {
    const fake = await import("fake-indexeddb");
    globalThis.indexedDB = fake.indexedDB;
    globalThis.IDBKeyRange = fake.IDBKeyRange;
    const { applyMailSyncResponse, openMailDatabase, destroyMailDatabase } = await loadModule(
      "/apps/web/test/features/mail/mail-mutation-fixture.ts",
    );
    const db = await openMailDatabase({
      apiOrigin: "https://recovery.test",
      bindingId: "recovery",
      connectionId: "c",
      userId: "u",
      workspaceId: "w",
    });
    try {
      await db.threads.put({ id: "archived", messageIds: ["old"], labelIds: [], internalDate: 1 });
      await applyMailSyncResponse(
        db,
        {
          mode: "recovery",
          threads: [],
          messages: [],
          labels: [],
          deletedThreadIds: [],
          deletedMessageIds: [],
          historyId: "30",
          mailboxRevision: 3,
          nextPageToken: "page2",
        },
        "inbox",
      );
      assert.ok(await db.threads.get("archived"));
      assert.deepEqual((await db.syncState.get("primary")).pendingThreadReconciliationIds, [
        "archived",
      ]);
      await applyMailSyncResponse(
        db,
        {
          mode: "full",
          threads: [],
          messages: [],
          labels: [],
          deletedThreadIds: [],
          deletedMessageIds: [],
          historyId: "20",
          mailboxRevision: 2,
          nextPageToken: null,
        },
        "inbox",
        { markViewLoaded: false, advanceHistory: false },
      );
      assert.equal((await db.syncState.get("primary")).historyId, "30");
      assert.equal((await db.syncState.get("primary")).pageTokens.inbox, "page2");
    } finally {
      await destroyMailDatabase(db.name);
    }
  });
  test("mail mutation recovery distinguishes rejected writes from uncertain outcomes", async () => {
    const fake = await import("fake-indexeddb");
    globalThis.indexedDB = fake.indexedDB;
    globalThis.IDBKeyRange = fake.IDBKeyRange;
    const {
      ApiError,
      runMailThreadMutation,
      runMailMessageMutation,
      openMailDatabase,
      destroyMailDatabase,
    } = await loadModule("/apps/web/test/features/mail/mail-mutation-fixture.ts");
    for (const kind of ["thread", "message"]) {
      for (const status of [403, 503]) {
        const database = await openMailDatabase({
          apiOrigin: "https://mail-mutations.test",
          bindingId: `${kind}-${status}`,
          connectionId: "connection",
          userId: "user",
          workspaceId: "workspace",
        });
        try {
          const thread = {
            id: "thread",
            labelIds: ["INBOX"],
            messageIds: ["message"],
            unread: false,
            starred: false,
            important: false,
          };
          const message = {
            id: "message",
            threadId: "thread",
            labelIds: ["INBOX"],
            internalDate: 1,
          };
          await database.threads.put(thread);
          await database.messages.put(message);
          const failure = new ApiError("Provider failure", status, {});
          const run = kind === "thread" ? runMailThreadMutation : runMailMessageMutation;
          await assert.rejects(
            run({
              database,
              threadId: "thread",
              messageId: "message",
              modification: { addLabelIds: ["STARRED"] },
              request: async () => {
                assert.equal(
                  (await database.messages.get("message")).labelIds.includes("STARRED"),
                  true,
                );
                throw failure;
              },
            }),
            (error) => error === failure,
          );
          assert.equal(
            (await database.messages.get("message")).labelIds.includes("STARRED"),
            status === 503,
          );
          const state = await database.syncState.get("primary");
          assert.deepEqual(
            kind === "thread"
              ? state.pendingThreadReconciliationIds
              : state.pendingMessageReconciliationIds,
            [kind],
          );
        } finally {
          await destroyMailDatabase(database.name);
        }
      }
    }
  });
  test("cache synchronization resumes loaded views and keeps search separate from their checkpoints", async () => {
    const fake = await import("fake-indexeddb");
    globalThis.indexedDB = fake.indexedDB;
    globalThis.IDBKeyRange = fake.IDBKeyRange;
    const { synchronizeMailCache, openMailDatabase, destroyMailDatabase } = await loadModule(
      "/apps/web/test/features/mail/mail-mutation-fixture.ts",
    );
    const database = await openMailDatabase({
      apiOrigin: "https://mail-sync.test",
      bindingId: "cache-sync",
      connectionId: "connection",
      userId: "user",
      workspaceId: "workspace",
    });
    try {
      await database.syncState.put({
        ...(await database.syncState.get("primary")),
        id: "primary",
        historyId: "10",
        loadedViews: { inbox: true },
        pageTokens: { inbox: "next" },
      });
      const requests = [];
      const request = async (url, options) => {
        requests.push({ url, body: JSON.parse(options.body) });
        return {
          deletedMessageIds: [],
          deletedThreadIds: [],
          historyId: "20",
          labels: [],
          mailboxRevision: 2,
          messages: [],
          mode: "incremental",
          nextPageToken: "next",
          threads: [],
        };
      };
      const input = {
        database,
        mailBasePath: "/mail/workspace",
        connectionId: "connection",
        view: "inbox",
      };
      await synchronizeMailCache(input, request);
      assert.deepEqual(requests[0], {
        url: "/mail/workspace/sync",
        body: { connectionId: "connection", historyId: "10", view: "inbox" },
      });
      assert.equal((await database.syncState.get("primary")).historyId, "20");
      await synchronizeMailCache(input, request, { loadMore: true });
      assert.equal(requests[1].body.historyId, undefined);
      assert.equal(requests[1].body.pageToken, "next");
      const result = await synchronizeMailCache({ ...input, view: "sent" }, request, {
        search: "  from:ada  ",
      });
      assert.equal(result.isSearch, true);
      assert.equal(requests[2].body.query, "from:ada");
      assert.equal(requests[2].body.historyId, undefined);
      assert.notEqual((await database.syncState.get("primary")).loadedViews.sent, true);
      const before = await database.syncState.get("primary");
      await assert.rejects(
        synchronizeMailCache(input, async () => {
          throw new Error("offline");
        }),
        /offline/,
      );
      assert.deepEqual(await database.syncState.get("primary"), before);
    } finally {
      await destroyMailDatabase(database.name);
    }
  });
}
