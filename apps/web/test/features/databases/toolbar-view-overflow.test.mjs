export function register({ assert, loadModule, test }) {
  test("toolbar overflow reserves add/overflow controls and pins the active view", async () => {
    const { getVisibleToolbarViewCount, partitionToolbarViews } = await loadModule(
      "/src/features/databases/views/model/toolbar-view-overflow.ts",
    );
    const input = {
      viewCount: 4,
      tabWidths: [60, 60, 60, 120],
      availableWidth: 500,
      overflowWidth: 40,
      activeIndex: 3,
      canAddView: true,
    };
    assert.equal(getVisibleToolbarViewCount(input), 4);
    assert.equal(getVisibleToolbarViewCount({ ...input, availableWidth: 250 }), 1);
    assert.equal(
      getVisibleToolbarViewCount({ ...input, availableWidth: 250, canAddView: false }),
      2,
    );
    assert.equal(
      getVisibleToolbarViewCount({ ...input, viewCount: 0, tabWidths: [], availableWidth: 0 }),
      0,
    );
    const views = ["one", "two", "three", "four"].map((id) => ({ id }));
    assert.deepEqual(partitionToolbarViews(views, views[3], 2), {
      visibleViewTabs: [views[0], views[3]],
      overflowViewTabs: [views[1], views[2]],
    });
    assert.deepEqual(partitionToolbarViews(views, undefined, 2), {
      visibleViewTabs: views.slice(0, 2),
      overflowViewTabs: views.slice(2),
    });
    assert.deepEqual(partitionToolbarViews(views, views[3], 0), {
      visibleViewTabs: [],
      overflowViewTabs: views,
    });
  });
}
