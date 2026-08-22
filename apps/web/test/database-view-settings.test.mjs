export function register({ assert, loadModule, test }) {
  test("database property icons persist in property and name-column config", async () => {
    const {
      getDatabasePropertyIcon,
      getMergedNameColumnConfig,
      getMergedPropertyConfig,
      getNameColumnIcon,
      getDatabaseViewIcon,
    } = await loadModule(
      "/src/editor/extensions/database/views/database-view-config.ts",
    );

    assert.equal(getDatabasePropertyIcon({ icon: "🌐" }), "🌐");
    assert.equal(getDatabasePropertyIcon({ icon: 42 }), "");
    assert.equal(getNameColumnIcon({ nameColumn: { icon: "📝" } }), "📝");
    assert.equal(getNameColumnIcon({}), "");
    assert.equal(getDatabaseViewIcon({ icon: "<svg>view</svg>" }), "<svg>view</svg>");
    assert.equal(getDatabaseViewIcon({ icon: 42 }), "");
    assert.deepEqual(
      getMergedPropertyConfig({ wrapContent: true }, { icon: "🌐" }),
      { icon: "🌐", wrapContent: true },
    );
    assert.deepEqual(
      getMergedNameColumnConfig(
        { nameColumn: { label: "Task" } },
        { icon: "📝" },
      ),
      { nameColumn: { icon: "📝", label: "Task" } },
    );
  });

  test("database view settings expose one canonical layout catalog", async () => {
    const { databaseViewTypeOptions, getDatabaseViewTypePresentation } =
      await loadModule(
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
        { label: "Form", type: "form" },
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

  test("database form headers normalize editable page metadata", async () => {
    const { getDatabaseFormHeaderSettings } = await loadModule(
      "/src/editor/extensions/database/views/form/database-form-header-config.ts",
    );

    assert.deepEqual(getDatabaseFormHeaderSettings(undefined), {
      cover: "",
      description: "",
      icon: "",
      iconPosition: "inline",
      title: "",
    });
    assert.deepEqual(
      getDatabaseFormHeaderSettings({
        formHeader: {
          cover: "https://example.test/cover.png",
          description: "Tell us what you need.",
          icon: "📝",
          iconPosition: "top",
          title: "Project request",
        },
      }),
      {
        cover: "https://example.test/cover.png",
        description: "Tell us what you need.",
        icon: "📝",
        iconPosition: "top",
        title: "Project request",
      },
    );
  });

  test("database form questions normalize options and move in view order", async () => {
    const { getDatabaseFormQuestionSettings, moveDatabaseFormQuestion } =
      await loadModule(
        "/src/editor/extensions/database/views/form/database-form-question-config.ts",
      );

    assert.deepEqual(
      getDatabaseFormQuestionSettings(undefined, "name", "Task name"),
      {
        description: "",
        descriptionEnabled: false,
        label: "Task name",
        longAnswer: false,
        required: false,
        syncWithPropertyName: true,
      },
    );
    assert.deepEqual(
      getDatabaseFormQuestionSettings(
        {
          formQuestions: {
            status: {
              description: "Choose the closest match",
              descriptionEnabled: true,
              label: "Current state",
              required: true,
              syncWithPropertyName: false,
            },
          },
        },
        "status",
        "Status",
      ),
      {
        description: "Choose the closest match",
        descriptionEnabled: true,
        label: "Current state",
        longAnswer: false,
        required: true,
        syncWithPropertyName: false,
      },
    );
    assert.deepEqual(
      moveDatabaseFormQuestion(["name", "status", "owner"], "name", "bottom"),
      ["status", "owner", "name"],
    );
    assert.deepEqual(
      moveDatabaseFormQuestion(["name", "status", "owner"], "owner", "up"),
      ["name", "owner", "status"],
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
        parentPropertyId: "parent-property",
        property: "parent-item",
        subItemPropertyId: "sub-item-property",
      },
    });
    const view = getDatabaseSubItemsView({
      filteredRows: rows,
      hasFilters: false,
      propertyValuesByKey: {
        "page-child:parent-property": "page-parent",
        "page-grandchild:parent-property": "page-child",
      },
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
        parentPropertyId: "parent-property",
        property: "parent-item",
        subItemPropertyId: "sub-item-property",
      },
      propertyValuesByKey: {
        "page-child:parent-property": "page-parent",
        "page-hidden-child:parent-property": "page-hidden-parent",
      },
      sortedRows: [parent],
    });

    assert.deepEqual(
      view.rows.map((row) => row.id),
      ["parent", "child"],
    );
  });

  test("database sub-items use only the first parent relation value", async () => {
    const { getDatabaseSubItemsSettings } = await loadModule(
      "/src/editor/extensions/database/views/database-view-config.ts",
    );
    const { getDatabaseSubItemsView } = await loadModule(
      "/src/editor/extensions/database/views/database-sub-items.ts",
    );
    const rows = [
      { id: "parent-a", pageId: "page-a", position: 0 },
      { id: "parent-b", pageId: "page-b", position: 1 },
      { id: "child", pageId: "page-child", position: 2 },
    ];
    const settings = getDatabaseSubItemsSettings({
      subItems: {
        display: "nested",
        enabled: true,
        filter: "parents-only",
        parentPropertyId: "parent-property",
        property: "parent-item",
        subItemPropertyId: "sub-item-property",
      },
    });
    const view = getDatabaseSubItemsView({
      filteredRows: rows,
      hasFilters: false,
      propertyValuesByKey: {
        "page-child:parent-property": ["page-a", "page-b"],
      },
      rows,
      settings,
      sortedRows: rows,
    });

    assert.equal(settings.parentPropertyId, "parent-property");
    assert.equal(settings.subItemPropertyId, "sub-item-property");
    assert.deepEqual(view.parentRowIdsByRowId, {
      child: ["parent-a"],
    });
    assert.deepEqual(view.childRowIdsByParentId, {
      "parent-a": ["child"],
    });
    assert.deepEqual(
      view.rows.map((row) => row.id),
      ["parent-a", "child", "parent-b"],
    );
  });

  test("database sub-item create rows follow the existing child rows", async () => {
    const { getSubItemCreateRowsAfterRow } = await loadModule(
      "/src/editor/extensions/database/views/database-sub-items.ts",
    );
    const rows = [
      createSubItemRow("parent", null, 0),
      createSubItemRow("child-1", "parent", 1),
      createSubItemRow("child-2", "parent", 2),
      createSubItemRow("sibling", null, 3),
    ];

    assert.deepEqual(
      getSubItemCreateRowsAfterRow({
        expandedRowIds: new Set(["parent"]),
        parentRowIdsByRowId: {
          "child-1": ["parent"],
          "child-2": ["parent"],
        },
        rows,
      }),
      { "child-2": ["parent"] },
    );
  });

  test("database nested create rows close from the deepest branch outward", async () => {
    const { getSubItemCreateRowsAfterRow } = await loadModule(
      "/src/editor/extensions/database/views/database-sub-items.ts",
    );
    const rows = [
      createSubItemRow("parent", null, 0),
      createSubItemRow("child", "parent", 1),
      createSubItemRow("grandchild", "child", 2),
    ];

    assert.deepEqual(
      getSubItemCreateRowsAfterRow({
        expandedRowIds: new Set(["parent", "child"]),
        parentRowIdsByRowId: {
          child: ["parent"],
          grandchild: ["child"],
        },
        rows,
      }),
      { grandchild: ["child", "parent"] },
    );
  });

  test("database sub-item drop lines resolve their hierarchy level", async () => {
    const { getDatabaseSubItemLineParentRowId } = await loadModule(
      "/src/editor/extensions/database/views/database-sub-items.ts",
    );
    const rows = [
      { id: "parent-a" },
      { id: "child-a" },
      { id: "parent-b" },
      { id: "parent-c" },
    ];
    const input = {
      childRowIdsByParentId: {
        "parent-a": ["child-a"],
        "parent-b": ["hidden-child-b"],
      },
      collapsedRowIds: new Set(["parent-b"]),
      parentRowIdsByRowId: { "child-a": ["parent-a"] },
      rows,
    };

    assert.equal(
      getDatabaseSubItemLineParentRowId({ ...input, targetIndex: 1 }),
      "parent-a",
    );
    assert.equal(
      getDatabaseSubItemLineParentRowId({ ...input, targetIndex: 2 }),
      null,
    );
    assert.equal(
      getDatabaseSubItemLineParentRowId({
        ...input,
        preferPreviousRowAsParent: true,
        targetIndex: 2,
      }),
      "child-a",
    );
    assert.equal(
      getDatabaseSubItemLineParentRowId({ ...input, targetIndex: 3 }),
      "parent-b",
    );
  });

  test("database sub-item line moves sync parent and inverse relation arrays", async () => {
    const { getDatabaseSubItemRelationChanges } = await loadModule(
      "/src/editor/extensions/database/views/database-sub-items.ts",
    );
    const rows = [
      { id: "parent-a", pageId: "page-a", position: 0 },
      { id: "parent-b", pageId: "page-b", position: 1 },
      { id: "dragged", pageId: "page-dragged", position: 2 },
    ];
    const propertyValuesByKey = {
      "page-a:sub-item-property": ["page-dragged"],
      "page-dragged:parent-property": ["page-a"],
    };

    assert.deepEqual(
      getDatabaseSubItemRelationChanges({
        draggedRowId: "dragged",
        parentPropertyId: "parent-property",
        propertyValuesByKey,
        rows,
        subItemPropertyId: "sub-item-property",
        targetParentRowId: "parent-b",
      }),
      [
        {
          currentValue: ["page-a"],
          nextValue: ["page-b"],
          propertyId: "parent-property",
          rowId: "dragged",
        },
        {
          currentValue: ["page-dragged"],
          nextValue: [],
          propertyId: "sub-item-property",
          rowId: "parent-a",
        },
        {
          currentValue: "",
          nextValue: ["page-dragged"],
          propertyId: "sub-item-property",
          rowId: "parent-b",
        },
      ],
    );

    assert.deepEqual(
      getDatabaseSubItemRelationChanges({
        draggedRowId: "dragged",
        parentPropertyId: "parent-property",
        propertyValuesByKey,
        rows,
        subItemPropertyId: "sub-item-property",
        targetParentRowId: null,
      }),
      [
        {
          currentValue: ["page-a"],
          nextValue: [],
          propertyId: "parent-property",
          rowId: "dragged",
        },
        {
          currentValue: ["page-dragged"],
          nextValue: [],
          propertyId: "sub-item-property",
          rowId: "parent-a",
        },
      ],
    );

    assert.equal(
      getDatabaseSubItemRelationChanges({
        draggedRowId: "parent-a",
        parentPropertyId: "parent-property",
        propertyValuesByKey,
        rows,
        subItemPropertyId: "sub-item-property",
        targetParentRowId: "dragged",
      }),
      null,
    );
  });
}

function createSubItemRow(id, parentRowId, position) {
  return { id, pageId: `page-${id}`, parentRowId, position };
}
