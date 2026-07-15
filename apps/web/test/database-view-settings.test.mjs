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
}
