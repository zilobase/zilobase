export function register({ assert, loadModule, test }) {
  test("database view settings expose one canonical layout catalog", async () => {
    const {
      databaseViewTypeOptions,
      getDatabaseViewTypePresentation,
    } = await loadModule(
      "/src/editor/extensions/database/views/view-settings/view-type-options.ts",
    );

    assert.deepEqual(
      databaseViewTypeOptions.map(({ label, type }) => ({ label, type })),
      [
        { label: "Table", type: "table" },
        { label: "Board", type: "kanban" },
        { label: "Timeline", type: "timeline" },
        { label: "List", type: "list" },
        { label: "Gallery", type: "gallery" },
        { label: "Chart", type: "chart" },
      ],
    );

    assert.equal(getDatabaseViewTypePresentation("kanban").label, "Kanban");
    assert.equal(getDatabaseViewTypePresentation("unknown").label, "Table");
  });

  test("database chart view settings derive stable UI labels", async () => {
    const {
      getChartAxisGroups,
      getChartRangeLabel,
      getChartSortOptions,
      parseOptionalChartNumber,
    } = await loadModule(
      "/src/editor/extensions/database/views/view-settings/chart-settings-model.ts",
    );

    assert.equal(getChartRangeLabel({}), "Auto");
    assert.equal(getChartRangeLabel({ rangeMax: 20 }), "Auto – 20");
    assert.equal(parseOptionalChartNumber(""), undefined);
    assert.equal(parseOptionalChartNumber("invalid"), undefined);
    assert.equal(parseOptionalChartNumber("12.5"), 12.5);
    assert.equal(
      getChartSortOptions("Status", "Points")[4].label,
      "Points high → low",
    );
    assert.deepEqual(
      getChartAxisGroups({
        id: "status",
        property: {
          config: {
            options: [
              { color: "green", name: "Done" },
              { name: "Queued" },
              { color: "red" },
            ],
          },
          id: "status",
          name: "Status",
          type: "status",
        },
      }),
      [
        { color: "green", name: "Done" },
        { color: undefined, name: "Queued" },
      ],
    );
  });

  test("database sub-item settings normalize and build nested rows", async () => {
    const { getDatabaseSubItemsSettings } = await loadModule(
      "/src/editor/extensions/database/views/database-view-config.ts",
    );
    const { getDatabaseSubItemsView } = await loadModule(
      "/src/editor/extensions/database/views/database-sub-items.ts",
    );
    const rows = [
      createSubItemRow("parent", null, 0),
      createSubItemRow("sibling", null, 1),
      createSubItemRow("child", "parent", 2),
      createSubItemRow("grandchild", "child", 3),
    ];
    const settings = getDatabaseSubItemsSettings({
      subItems: {
        display: "nested",
        enabled: true,
        filter: "parents-only",
        property: "sub-item",
      },
    });
    const view = getDatabaseSubItemsView({
      filteredRows: rows,
      hasFilters: false,
      rows,
      settings,
      sortedRows: [rows[1], rows[0], rows[2], rows[3]],
    });

    assert.deepEqual(
      view.rows.map((row) => row.id),
      ["sibling", "parent", "child", "grandchild"],
    );
    assert.deepEqual(view.depthByRowId, {
      sibling: 0,
      parent: 0,
      child: 1,
      grandchild: 2,
    });
    assert.deepEqual(view.childRowIdsByParentId, {
      parent: ["child"],
      child: ["grandchild"],
    });
  });

  test("database parent-only filters keep matching parents with descendants", async () => {
    const { getDatabaseSubItemsView } = await loadModule(
      "/src/editor/extensions/database/views/database-sub-items.ts",
    );
    const parent = createSubItemRow("parent", null, 0);
    const child = createSubItemRow("child", "parent", 1);
    const hiddenParent = createSubItemRow("hidden-parent", null, 2);
    const hiddenChild = createSubItemRow("hidden-child", "hidden-parent", 3);
    const rows = [parent, child, hiddenParent, hiddenChild];
    const view = getDatabaseSubItemsView({
      filteredRows: [parent],
      hasFilters: true,
      rows,
      settings: {
        display: "nested",
        enabled: true,
        filter: "parents-only",
        property: "sub-item",
      },
      sortedRows: [parent],
    });

    assert.deepEqual(
      view.rows.map((row) => row.id),
      ["parent", "child"],
    );
  });
}

function createSubItemRow(id, parentRowId, position) {
  return { id, parentRowId, position };
}
