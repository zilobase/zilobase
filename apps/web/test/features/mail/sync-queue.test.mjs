export function register({ assert, loadModule, test }) {
  test("sync requests coalesce and different views serialize", async () => {
    const { runMailSyncOnce, mailPollDelay } = await loadModule(
      "/src/features/mail/sync/sync-queue.ts",
    );
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const calls = [];
    const first = runMailSyncOnce("db", "inbox", async () => {
      calls.push("inbox");
      await gate;
      return 1;
    });
    const duplicate = runMailSyncOnce("db", "inbox", async () => {
      throw new Error("duplicate");
    });
    const second = runMailSyncOnce("db", "sent", async () => {
      calls.push("sent");
      return 2;
    });
    release();
    assert.deepEqual(await Promise.all([first, duplicate, second]), [1, 1, 2]);
    assert.deepEqual(calls, ["inbox", "sent"]);
    assert.equal(mailPollDelay(false, 0, 0, 0), 60_000);
    assert.equal(mailPollDelay(true, 0, 0, 0), 300_000);
    assert.equal(mailPollDelay(false, 2, 500_000, 0), 500_000);
  });
}
