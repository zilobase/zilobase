export function register({ assert, loadModule, test }) {
  test("database chart config normalizes persisted settings", async () => {
    const { getDatabaseChartSettings } = await loadModule(
      "/src/editor/extensions/database/views/chart/database-chart-config.ts",
    );

    assert.deepEqual(
      getDatabaseChartSettings({
        chart: {
          color: "purple",
          groupByPropertyId: "property-status",
          measurePropertyId: "property-points",
          omitZeroValues: true,
          type: "horizontal-bar",
          valueColors: {
            "property-status:Done": "green",
            "property-status:Invalid": "not-a-color",
          },
        },
      }),
      {
        color: "purple",
        groupByPropertyId: "property-status",
        measurePropertyId: "property-points",
        omitZeroValues: true,
        type: "horizontal-bar",
        valueColors: {
          "property-status:Done": "green",
        },
      },
    );
  });

  test("database chart config preserves radial charts", async () => {
    const { getDatabaseChartSettings } = await loadModule(
      "/src/editor/extensions/database/views/chart/database-chart-config.ts",
    );

    assert.equal(
      getDatabaseChartSettings({ chart: { type: "radial" } }).type,
      "radial",
    );
  });

  test("database chart config preserves radar charts", async () => {
    const { getDatabaseChartSettings } = await loadModule(
      "/src/editor/extensions/database/views/chart/database-chart-config.ts",
    );

    assert.equal(
      getDatabaseChartSettings({ chart: { type: "radar" } }).type,
      "radar",
    );
  });

  test("database charts do not split a series by its own axis", async () => {
    const { shouldSplitDatabaseChartSeries } = await loadModule(
      "/src/editor/extensions/database/views/chart/database-chart-config.ts",
    );

    assert.equal(
      shouldSplitDatabaseChartSeries({
        axisPropertyId: "status",
        splitPropertyId: "status",
        type: "radar",
      }),
      false,
    );
    assert.equal(
      shouldSplitDatabaseChartSeries({
        axisPropertyId: "quarter",
        splitPropertyId: "status",
        type: "radar",
      }),
      true,
    );
  });

  test("database chart config normalizes advanced chart controls", async () => {
    const { getDatabaseChartSettings } = await loadModule(
      "/src/editor/extensions/database/views/chart/database-chart-config.ts",
    );
    const settings = getDatabaseChartSettings({
      chart: {
        rangeMax: 20,
        rangeMin: "invalid",
        referenceLines: [
          {
            color: "blue",
            id: "target",
            label: "Target",
            style: "dotted",
            value: 12,
          },
          { value: "invalid" },
        ],
        sort: "axis-asc",
        splitByDateInterval: "month",
        splitByPropertyId: "due-date",
      },
    });

    assert.equal(settings.rangeMin, undefined);
    assert.equal(settings.rangeMax, 20);
    assert.equal(settings.sort, "axis-asc");
    assert.equal(settings.splitByDateInterval, "month");
    assert.equal(settings.splitByPropertyId, "due-date");
    assert.deepEqual(settings.referenceLines, [
      {
        color: "blue",
        id: "target",
        label: "Target",
        style: "dotted",
        value: 12,
      },
    ]);
  });

  test("database chart sorting supports labels, values, and manual order", async () => {
    const { sortDatabaseChartData } = await loadModule(
      "/src/editor/extensions/database/views/chart/database-chart-data.ts",
    );
    const data = [
      { color: "red", count: 2, name: "Beta" },
      { color: "blue", count: 1, name: "Alpha" },
      { color: "green", count: 3, name: "Gamma" },
    ];

    assert.deepEqual(
      sortDatabaseChartData(data, "axis-asc").map((item) => item.name),
      ["Alpha", "Beta", "Gamma"],
    );
    assert.deepEqual(
      sortDatabaseChartData(data, "value-desc").map((item) => item.name),
      ["Gamma", "Beta", "Alpha"],
    );
    assert.deepEqual(
      sortDatabaseChartData(data, "manual").map((item) => item.name),
      ["Beta", "Alpha", "Gamma"],
    );
  });

  test("database chart data groups rows and sums numeric measures", async () => {
    const { createChartData } = await loadModule(
      "/src/editor/extensions/database/views/chart/database-chart-data.ts",
    );
    const status = createProperty("status", "Status", "status", {
      options: [
        { id: "todo", name: "To do", color: "gray" },
        { id: "doing", name: "Doing", color: "blue" },
        { id: "done", name: "Done", color: "green" },
      ],
    });
    const points = createProperty("points", "Points", "number");
    const rows = [createRow("a", "First"), createRow("b", "Second")];
    const data = createChartData({
      groupByPropertyId: "status",
      measurePropertyId: "points",
      omitZeroValues: false,
      personNamesById: new Map(),
      properties: [status, points],
      propertyValuesByKey: {
        "page-a:points": "3",
        "page-a:status": "Doing",
        "page-b:points": "5",
        "page-b:status": "Doing",
      },
      rows,
      valueColors: {},
    });

    assert.deepEqual(
      data.map(({ count, name }) => ({ count, name })),
      [
        { count: 8, name: "Doing" },
        { count: 0, name: "To do" },
        { count: 0, name: "Done" },
      ],
    );
  });

  test("database chart data omits empty and zero-valued groups", async () => {
    const { createChartData } = await loadModule(
      "/src/editor/extensions/database/views/chart/database-chart-data.ts",
    );
    const status = createProperty("status", "Status", "status");
    const points = createProperty("points", "Points", "number");
    const data = createChartData({
      groupByPropertyId: "status",
      measurePropertyId: "points",
      omitZeroValues: true,
      personNamesById: new Map(),
      properties: [status, points],
      propertyValuesByKey: {
        "page-a:points": "0",
        "page-a:status": "Doing",
        "page-b:points": "2",
        "page-b:status": "",
        "page-c:points": "4",
        "page-c:status": "Done",
      },
      rows: [
        createRow("a", "First"),
        createRow("b", "Second"),
        createRow("c", "Third"),
      ],
      valueColors: {},
    });

    assert.deepEqual(
      data.map(({ count, name }) => ({ count, name })),
      [{ count: 4, name: "Done" }],
    );
  });

  test("database chart data creates stacked series from view grouping", async () => {
    const { createSplitChartData } = await loadModule(
      "/src/editor/extensions/database/views/chart/database-chart-data.ts",
    );
    const quarter = createProperty("quarter", "Quarter", "select");
    const status = createProperty("status", "Status", "status", {
      options: [
        { id: "doing", name: "Doing", color: "blue" },
        { id: "done", name: "Done", color: "green" },
      ],
    });
    const points = createProperty("points", "Points", "number");
    const result = createSplitChartData({
      axisProperty: quarter,
      measureProperty: points,
      omitZeroValues: false,
      personNamesById: new Map(),
      propertyValuesByKey: {
        "page-a:points": "2",
        "page-a:quarter": "Q1",
        "page-a:status": "Doing",
        "page-b:points": "3",
        "page-b:quarter": "Q1",
        "page-b:status": "Done",
        "page-c:points": "4",
        "page-c:quarter": "Q2",
        "page-c:status": "Done",
      },
      rows: [
        createRow("a", "First"),
        createRow("b", "Second"),
        createRow("c", "Third"),
      ],
      splitProperty: status,
      valueColors: {},
    });
    const seriesKeys = Object.fromEntries(
      result.series.map((series) => [series.label, series.key]),
    );

    assert.deepEqual(
      result.data.map((item) => ({
        count: item.count,
        doing: item[seriesKeys.Doing],
        done: item[seriesKeys.Done],
        name: item.name,
      })),
      [
        { count: 5, doing: 2, done: 3, name: "Q1" },
        { count: 4, doing: 0, done: 4, name: "Q2" },
      ],
    );
  });
}

function createProperty(id, name, type, config = {}) {
  return {
    id: `database-${id}`,
    position: 0,
    property: { config, id, name, type },
  };
}

function createRow(id, name) {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    id: `row-${id}`,
    page: { name },
    pageId: `page-${id}`,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
