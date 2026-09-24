export function register({ assert, loadModule, test }) {
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
}
