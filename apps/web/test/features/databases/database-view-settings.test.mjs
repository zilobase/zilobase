import { readFile } from "node:fs/promises";

export function register({ readSource, assert, loadModule, test }) {
  test("link existing data source owns its nested picker state", async () => {
    const settings = await readSource("/src/features/databases/views/view-settings/data-source-settings.tsx");

    assert.match(settings, /function LinkExistingDataSourcePicker/);
    assert.match(
      settings,
      /LinkExistingDataSourcePicker[\s\S]*?useState<string \| null>/,
    );
    assert.match(settings, /<LinkExistingDataSourcePicker/);
    assert.doesNotMatch(settings, /const renderLinkExistingPicker/);
  });

  test("manage data sources uses explicit ownership and hides stale links", async () => {
    const { partitionManagedDataSources } = await loadModule(
      "/src/features/databases/views/view-settings/data-source-model.ts",
    );
    const { linked, owned } = partitionManagedDataSources(
      [
        {
          id: "default",
          name: "Default",
          parentDatabaseId: "host",
          position: 0,
          viewCount: 0,
        },
        {
          id: "created",
          name: "Created here",
          parentDatabaseId: "host",
          position: 2,
          viewCount: 0,
        },
        {
          id: "linked",
          name: "Linked with a view",
          parentDatabaseId: "other",
          position: 1,
          viewCount: 1,
        },
        {
          id: "stale-link",
          name: "Linked without views",
          parentDatabaseId: "other",
          position: 3,
          viewCount: 0,
        },
      ],
      "host",
    );

    assert.deepEqual(
      owned.map((source) => source.id),
      ["default", "created"],
    );
    assert.deepEqual(
      linked.map((source) => source.id),
      ["linked"],
    );
  });

  test("adding a data source opens the shared database setup chooser", async () => {
    const [controller, controllerModel, databaseView, setupCard] = await Promise.all([
      readSource("/src/features/databases/views/use-database-view-controller.tsx"),
      readSource("/src/features/databases/model/database-controller-state.ts"),
      readSource("/src/features/databases/views/database-view.tsx"),
      readSource("/src/features/databases/setup/database-setup-card.tsx"),
    ]);

    assert.match(
      controller,
      /addDataSource: \(\) => setDataSourceSetupOpen\(true\)/,
    );
    assert.match(controller, /useCreateDatabaseDataSource/);
    assert.match(controllerModel, /parentDatabaseId: source\.parentDatabaseId/);
    assert.match(
      controller,
      /createDataSource\.mutateAsync\(\{[\s\S]*?databaseId,[\s\S]*?name: databaseName/,
    );
    assert.doesNotMatch(controller, /standalone: true/);
    assert.match(controller, /const unlinkDataSource = async/);
    assert.match(controller, /unlinkDatabaseDataSource\.mutateAsync/);
    assert.match(databaseView, /<DatabaseSetupCard[\s\S]*?onSelectDataSource/);
    assert.match(setupCard, /if \(onSelectDataSource\)/);
    assert.match(setupCard, /New empty data source/);
    assert.match(setupCard, /accept="\.csv,text\/csv"/);
    assert.match(setupCard, /function parseCsv/);
    assert.match(setupCard, /csvImport:/);
    assert.doesNotMatch(setupCard, /CSV import is coming soon/);
    assert.match(setupCard, /Link to existing data source/);
    assert.match(setupCard, /Create a new view/);
    assert.match(setupCard, /ViewTypeOptionGrid/);
    assert.match(setupCard, /viewConfig: viewItem\.config/);
  });

  test("deleting a final source view keeps it recoverable", async () => {
    const [controller, sourceItems] = await Promise.all([
      readSource("/src/features/databases/views/use-database-view-controller.tsx"),
      readSource("/src/features/databases/views/view-settings/data-source-items.tsx"),
    ]);

    assert.match(
      controller,
      /viewTabs\.length <= 1[\s\S]*?A database must always have at least one view/,
    );
    assert.match(controller, /addDataSourceView/);
    assert.match(controller, /linkDatabaseDataSource\.mutateAsync/);
    assert.match(controller, /const replaceActiveViewSource = async/);
    assert.match(
      controller,
      /replaceDatabaseViewDataSource\.mutateAsync\([\s\S]*?databaseViewId: resolvedActiveViewId/,
    );
    assert.match(controller, /mode: "add" \| "replace" = "add"/);
    assert.match(
      controller,
      /mode === "replace"[\s\S]*?replaceDatabaseViewDataSource\.mutateAsync/,
    );
    assert.match(sourceItems, /Add view/);
    assert.match(sourceItems, /ViewTypeOptionGrid/);
  });

  test("deleting a view never deletes its linked data source", async () => {
    const [controller, toolbar] = await Promise.all([
      readSource("/src/features/databases/views/use-database-view-controller.tsx"),
      readSource("/src/features/databases/views/database-view-toolbar.tsx"),
    ]);

    assert.match(controller, /deleteDatabaseView\.mutate/);
    assert.match(toolbar, /Its data source remains linked/);
    assert.doesNotMatch(toolbar, /Delete data source and view/);
    assert.doesNotMatch(controller, /deleteDataSource\.mutateAsync/);
  });

  test("embedded database expand links use the host database id", async () => {
    const toolbar = await readSource("/src/features/databases/views/database-view-toolbar.tsx");

    assert.match(toolbar, /const expandDatabaseId = hostDatabaseId \?\? databaseId/);
    assert.match(
      toolbar,
      /showExpandButton && expandDatabaseId[\s\S]*?params=\{\{ databaseId: expandDatabaseId \}\}/,
    );
    assert.doesNotMatch(
      toolbar,
      /showExpandButton && databaseId[\s\S]*?params=\{\{ databaseId \}\}/,
    );
  });

  test("view settings use full-panel navigation with only More settings nested", async () => {
    const [dropdrawer, dropdrawerContent, menu, settings, subItems, toolbar] =
      await Promise.all([
        readSource("/src/shared/ui/dropdown-menu.tsx"),
        readSource("/src/shared/ui/dropdrawer.tsx"),
        readSource("/src/features/databases/views/view-settings/index.tsx"),
        readSource("/src/features/databases/views/view-settings/data-source-settings.tsx"),
        readSource("/src/features/databases/views/view-settings/sub-items-settings.tsx"),
        readSource("/src/features/databases/views/database-view-toolbar.tsx"),
      ]);

    assert.match(toolbar, /activeDataSourceId=/);
    assert.match(toolbar, /activeViewTab\?\.dataSourceId/);
    assert.match(settings, /activeDataSourceName/);
    assert.match(settings, /icon=\{<Cable \/>\}/);
    assert.match(settings, /getDatabaseIconNode\(database\)/);
    assert.match(settings, /getDatabaseIconNode\(source\)/);
    assert.match(settings, /DEFAULT_DATABASE_ITEM_ICON/);
    assert.match(settings, /pinSearch/);
    assert.match(menu, /defaultSubDisplayMode="inline"/);
    assert.match(
      menu,
      /className="w-72 max-h-none overflow-visible"/,
    );
    assert.match(settings, /displayMode="nested"[\s\S]*?More settings/);
    assert.match(
      settings,
      /Link existing data source[\s\S]*?<LinkExistingDataSourcePicker/,
    );
    assert.match(
      settings,
      /renderDataSourcePicker\(dataSourceOptions\)/,
    );
    assert.doesNotMatch(settings, /<span>Add new view<\/span>/);
    assert.match(settings, /const sourceView = databaseOption\.database\.views\[0\]/);
    assert.match(settings, /onReplaceActiveViewSource\(sourceSelection\)/);
    assert.match(settings, /ownedDataSources/);
    assert.match(settings, /linkedDataSources/);
    assert.match(settings, /LinkedDataSourceMenuItem/);
    assert.match(settings, /Create a new view/);
    assert.match(settings, /ViewTypeOptionGrid/);
    assert.match(settings, /viewConfig: config/);
    assert.match(settings, /onUnlinkDataSource/);
    assert.match(subItems, /displayMode="inline"[\s\S]*?title="Sub-items"/);
    assert.match(
      dropdrawer,
      /aria-label=\{`Back from \$\{activePanel\.title\}`\}/,
    );
    assert.match(dropdrawer, /aria-label=\{`Close \$\{activePanel\.title\}`\}/);
    assert.match(
      dropdrawer,
      /min-h-0 flex-1 overflow-y-auto overscroll-contain/,
    );
    assert.match(
      dropdrawerContent,
      /max-h-\[min\(36rem,calc\(100vh-1rem\)\)\] max-w-\[min\(20rem,calc\(100vw-1rem\)\)\]/,
    );
  });

  test("database property icons persist in property and name-column config", async () => {
    const {
      getDatabasePropertyIcon,
      getMergedNameColumnConfig,
      getMergedPropertyConfig,
      getNameColumnIcon,
      getDatabaseViewIcon,
    } = await loadModule(
      "/src/features/databases/views/database-view-config.ts",
    );

    assert.equal(getDatabasePropertyIcon({ icon: "🌐" }), "🌐");
    assert.equal(getDatabasePropertyIcon({ icon: 42 }), "");
    assert.equal(getNameColumnIcon({ nameColumn: { icon: "📝" } }), "📝");
    assert.equal(getNameColumnIcon({}), "");
    assert.equal(
      getDatabaseViewIcon({ icon: "<svg>view</svg>" }),
      "<svg>view</svg>",
    );
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
        "/src/features/databases/views/view-settings/view-type-options.ts",
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
      "/src/features/databases/views/view-settings/chart-settings-model.ts",
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
      "/src/features/databases/views/form/database-form-header-config.ts",
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
        "/src/features/databases/views/form/database-form-question-config.ts",
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
      "/src/features/databases/views/database-view-config.ts",
    );
    const { getDatabaseSubItemsView } = await loadModule(
      "/src/features/databases/views/database-sub-items.ts",
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
      "/src/features/databases/views/database-sub-items.ts",
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
      "/src/features/databases/views/database-view-config.ts",
    );
    const { getDatabaseSubItemsView } = await loadModule(
      "/src/features/databases/views/database-sub-items.ts",
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
      "/src/features/databases/views/database-sub-items.ts",
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
      "/src/features/databases/views/database-sub-items.ts",
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
      "/src/features/databases/views/database-sub-items.ts",
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
      "/src/features/databases/views/database-sub-items.ts",
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
