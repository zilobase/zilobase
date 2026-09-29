export function register({ assert, loadModule, test }) {
  test("page navigation timing starts before the pane and is consumed once", async () => {
    const timing = await loadModule("/src/features/pages/navigation/page-navigation-timing.ts");
    const before = performance.now();
    timing.markPageNavigationStart("page-timing-1");
    const startedAt = timing.consumePageNavigationStart("page-timing-1");

    assert.ok(startedAt >= before && startedAt <= performance.now());
    assert.equal(timing.consumePageNavigationStart("page-timing-1"), null);
  });
}
