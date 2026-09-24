export function register({ assert, loadModule, test }) {
  test("mailbox refresh requests coalesce by local database", async () => {
    const { runMailRefreshOnce } = await loadModule(
      "/src/features/mail/sync/mail-refresh-queue.ts",
    );
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const calls = [];
    const first = runMailRefreshOnce("db", async () => {
      calls.push("inbox");
      await gate;
      return 1;
    });
    const duplicate = runMailRefreshOnce("db", async () => {
      throw new Error("duplicate");
    });
    const other = runMailRefreshOnce("other-db", async () => {
      calls.push("sent");
      return 2;
    });
    release();
    assert.deepEqual(await Promise.all([first, duplicate, other]), [1, 1, 2]);
    assert.deepEqual(calls.sort(), ["inbox", "sent"]);
  });
}
