export function register({ assert, loadModule, test }) {
  test("draft session serializes snapshots and keeps the created draft ID", async () => {
    const { createDraftSession } = await loadModule("/src/features/mail/compose/draft-session.ts");
    const calls = [];
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const session = createDraftSession(null, async (id, value) => {
      calls.push([id, value.bodyText]);
      if (!id) await gate;
      return "draft";
    });
    const first = session.save({ bodyText: "first" });
    const second = session.save({ bodyText: "latest" });
    await Promise.resolve();
    assert.deepEqual(calls, [[null, "first"]]);
    release();
    await Promise.all([first, second]);
    assert.deepEqual(calls, [
      [null, "first"],
      ["draft", "latest"],
    ]);
    await session.save({ bodyText: "latest" });
    assert.equal(calls.length, 2);
  });
  test("discard waits for creation then deletes the resulting draft", async () => {
    const { createDraftSession } = await loadModule("/src/features/mail/compose/draft-session.ts");
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const removed = [];
    const session = createDraftSession(null, async () => {
      await gate;
      return "created";
    });
    const save = session.save({ bodyText: "text" });
    await Promise.resolve();
    const discard = session.discard(async (id) => {
      removed.push(id);
    });
    release();
    await Promise.all([save, discard]);
    assert.deepEqual(removed, ["created"]);
    await session.save({ bodyText: "stale queued render" });
    assert.deepEqual(removed, ["created"]);
  });
  test("failed saves remain retryable without inventing a draft ID", async () => {
    const { createDraftSession } = await loadModule("/src/features/mail/compose/draft-session.ts");
    let attempts = 0;
    const session = createDraftSession(null, async (id) => {
      assert.equal(id, null);
      if (++attempts === 1) throw new Error("offline");
      return "draft";
    });
    await assert.rejects(session.save({ bodyText: "text" }), /offline/);
    assert.equal(await session.save({ bodyText: "text" }), "draft");
  });
  test("provider draft identity and version changes do not trigger another write", async () => {
    const { createDraftSession, mailDraftContentFingerprint } = await loadModule(
      "/src/features/mail/compose/draft-session.ts",
    );
    const calls = [];
    const session = createDraftSession("draft", async (id, value) => {
      calls.push([id, value.draftVersion]);
      return "draft";
    });
    await session.save({ bodyText: "same content", draftId: "draft", draftVersion: 1 });
    await session.save({ bodyText: "same content", draftId: "draft", draftVersion: 2 });
    assert.deepEqual(calls, [["draft", 1]]);
    assert.equal(
      mailDraftContentFingerprint({ bodyText: "same content", draftVersion: 1 }),
      mailDraftContentFingerprint({ bodyText: "same content", draftVersion: 99 }),
    );
  });
}
