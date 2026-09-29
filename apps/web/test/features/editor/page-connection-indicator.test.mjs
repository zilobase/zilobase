export function register({ assert, loadModule, test }) {
  test("page connection indicators notify only the matching breadcrumb", async () => {
    const {
      getPageConnectionIndicator,
      setPageConnectionIndicator,
      subscribePageConnectionIndicator,
    } = await loadModule("/src/features/editor/collaboration/page-connection-indicator.ts");
    const changes = [];
    const unsubscribeFirst = subscribePageConnectionIndicator("first", () => changes.push("first"));
    const unsubscribeSecond = subscribePageConnectionIndicator("second", () =>
      changes.push("second"),
    );

    try {
      setPageConnectionIndicator("first", "connecting");
      setPageConnectionIndicator("first", "connected");
      setPageConnectionIndicator("first", "connected");
      assert.deepEqual(changes, ["first", "first"]);
      assert.equal(getPageConnectionIndicator("first"), "connected");
      assert.equal(getPageConnectionIndicator("second"), null);

      setPageConnectionIndicator("first", null);
      assert.equal(getPageConnectionIndicator("first"), null);
      assert.deepEqual(changes, ["first", "first", "first"]);
    } finally {
      unsubscribeFirst();
      unsubscribeSecond();
      setPageConnectionIndicator("first", null);
      setPageConnectionIndicator("second", null);
    }
  });
}
