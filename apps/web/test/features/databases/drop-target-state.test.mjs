export function register({ assert, loadModule, test }) {
  test("table drag targets retain identity only when placement and parent are unchanged", async () => {
    const { retainTableRowDropTarget, retainGroupRowDropTarget } = await loadModule(
      "/src/features/databases/views/table/model/database-table-model.ts",
    );
    for (const [retain, current, changes] of [
      [
        retainTableRowDropTarget,
        { index: 1, lineTop: 20 },
        [
          { index: 2 },
          { lineTop: 21 },
          { subItemParentRowId: null },
          { subItemParentRowId: "parent" },
        ],
      ],
      [
        retainGroupRowDropTarget,
        { localTargetIndex: 1, sectionId: "group", top: 20 },
        [{ localTargetIndex: 2 }, { sectionId: "other" }, { top: 21 }],
      ],
    ]) {
      assert.equal(retain(null, null), null);
      assert.equal(retain(current, null), null);
      assert.equal(retain(null, current), current);
      assert.equal(retain(current, { ...current }), current);
      for (const change of changes) {
        const next = { ...current, ...change };
        assert.equal(retain(current, next), next);
      }
    }
  });
  test("property insertion keeps pending positions authoritative on both sides", async () => {
    const { propertyInsertPositions } = await loadModule(
      "/src/features/databases/views/table/model/database-table-model.ts",
    );
    assert.deepEqual(propertyInsertPositions(undefined, undefined), {
      left: 0,
      right: 1,
    });
    assert.deepEqual(propertyInsertPositions(undefined, 4), {
      left: 4,
      right: 5,
    });
    assert.deepEqual(propertyInsertPositions(0, 4), { left: 0, right: 0 });
    assert.deepEqual(propertyInsertPositions(2.5, 4), {
      left: 2.5,
      right: 2.5,
    });
  });
}
