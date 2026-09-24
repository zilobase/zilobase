export function register({ assert, loadModule, test }) {
  const load = () => loadModule("/src/features/library/model/library-model.ts");
  test("Skills and Instructions tabs contain only matching saved items", async () => {
    const { buildHomepageRows, applyHomepageView, buildHomepageViewData } = await load();
    const page = {
      name: "Saved item",
      createdAt: "2026-09-08",
      updatedAt: "2026-09-08",
      workspaceId: "workspace",
      type: "page",
      metadata: {},
    };
    const rows = buildHomepageRows(
      {
        pages: [
          { ...page, id: "ordinary" },
          { ...page, id: "skill", metadata: { zilobaseai: "skill" } },
          { ...page, id: "instruction", metadata: { zilobaseai: "instruction" } },
          { ...page, id: "deleted", deletedAt: "2026-09-08", metadata: { zilobaseai: "skill" } },
          { ...page, id: "meeting", type: "meeting", metadata: { zilobaseai: "instruction" } },
        ],
        databases: [{ ...page, id: "database", metadata: { zilobaseai: "skill" } }],
        placements: [],
      },
      [],
      [
        {
          id: "agent",
          name: "Agent",
          ownerUserId: "owner",
          status: "active",
          updatedAt: "2026-09-08",
        },
      ],
      "home",
    );
    for (const [view, id] of [
      ["skills", "skill"],
      ["instructions", "instruction"],
    ]) {
      assert.deepEqual(
        applyHomepageView(rows, view).map((row) => row.id),
        [`page:${id}`],
      );
      const viewData = buildHomepageViewData({
        activeViewId: view,
        rows,
        mode: "home",
        workspaceId: "workspace",
        databaseConfig: {},
        propertyConfigs: {},
        viewConfigs: {},
      });
      assert.deepEqual(
        viewData.records.map((record) => record.id),
        [`page:${id}`],
      );
      assert.equal(rows.find((row) => row.id === `page:${id}`).openPageId, id);
    }
    assert.deepEqual(applyHomepageView([], "skills"), []);
    assert.deepEqual(applyHomepageView([], "instructions"), []);
  });
  test("library models keep meeting rows separate and exclude deleted pages and archived agents", async () => {
    const { buildHomepageRows, applyHomepageView } = await load();
    const page = {
      id: "page",
      name: " Page ",
      createdAt: "2025-01-01",
      updatedAt: "2025-01-02",
      createdBy: { name: " Owner " },
      metadata: {},
      workspaceId: "workspace",
      type: "page",
    };
    const navigation = {
      pages: [
        page,
        { ...page, id: "deleted", deletedAt: "2025-01-03" },
        { ...page, id: "notes", type: "meeting" },
      ],
      databases: [],
      placements: [],
    };
    const meetings = [
      {
        id: "meeting",
        title: " Standup ",
        pageId: "page",
        createdAt: "2025-01-01",
        updatedAt: "2025-01-02",
      },
    ];
    const agents = [
      {
        id: "active",
        name: "Agent",
        ownerUserId: "owner",
        status: "active",
        updatedAt: "2025-01-01",
      },
      {
        id: "archived",
        name: "Archive",
        ownerUserId: "owner",
        status: "archived",
        updatedAt: "2025-01-01",
      },
    ];
    const rows = buildHomepageRows(navigation, meetings, agents, "home");
    assert.deepEqual(
      rows.map((row) => row.id),
      ["page:page", "meeting:meeting", "agent:active"],
    );
    assert.deepEqual(
      applyHomepageView(rows, "meetings").map((row) => row.openMeetingId),
      ["meeting"],
    );
    assert.deepEqual(
      applyHomepageView(rows, "recents").map((row) => row.id),
      ["page:page", "agent:active"],
    );
    assert.equal(rows[0].createdBy, "Owner");
    assert.deepEqual(
      buildHomepageRows(navigation, meetings, agents, "trash").map((row) => row.id),
      ["page:deleted"],
    );
  });
  test("library view filters retain separate favourite, shared, private and teamspace decisions", async () => {
    const { applyHomepageView } = await load();
    const rows = [
      { id: "teamspace-root", itemKind: "teamspace", teamspaceId: "team" },
      {
        id: "private",
        itemKind: "page",
        isFavorite: true,
        isShared: false,
        teamspaceId: null,
      },
      { id: "shared", itemKind: "database", isShared: true, teamspaceId: null },
      {
        id: "team",
        itemKind: "page",
        isFavorite: true,
        isShared: true,
        teamspaceId: "team",
      },
      {
        id: "meeting",
        itemKind: "meeting",
        isFavorite: true,
        isShared: true,
        teamspaceId: "team",
      },
    ];
    const ids = (view) => applyHomepageView(rows, view).map((row) => row.id);
    assert.deepEqual(ids("favourites"), ["private", "team"]);
    assert.deepEqual(ids("shared"), ["shared"]);
    assert.deepEqual(ids("private"), ["private"]);
    assert.deepEqual(ids("teamspaces"), ["teamspace-root", "team"]);
  });
  test("library hierarchy promotes missing parents and orders children inside their teamspace", async () => {
    const { buildTeamspaceLibraryRows } = await load();
    const rows = [
      {
        id: "child",
        name: "Child",
        parentRowId: "root",
        position: 1,
        teamspaceId: "team",
      },
      {
        id: "root",
        name: "Root",
        parentRowId: "missing",
        position: 0,
        teamspaceId: "team",
      },
      {
        id: "other",
        name: "Other",
        parentRowId: null,
        position: 0,
        teamspaceId: "other",
      },
    ];
    assert.deepEqual(
      buildTeamspaceLibraryRows(rows, "team").map(({ depth, row }) => [depth, row.id]),
      [
        [0, "root"],
        [1, "child"],
      ],
    );
  });
  test("Library tabs nest descendants and Teamspaces uses teamspace parent rows", async () => {
    const { buildHomepageRows, buildHomepageViewData, libraryParentPropertyId } = await load();
    const { deriveDatabaseViewModel } = await loadModule(
      "/src/features/databases/views/model/database-view-model.ts",
    );
    const page = (id, parentPageId, isFavorite) => ({
      id,
      name: id,
      createdAt: "2026-09-01",
      updatedAt: "2026-09-02",
      workspaceId: "workspace",
      type: "page",
      teamspaceId: "team-a",
      parentPageId,
      isFavorite,
    });
    const teamspace = (id) => ({
      id,
      name: id,
      workspaceId: "workspace",
      createdAt: "2026-09-01",
      updatedAt: "2026-09-02",
      archivedAt: null,
      icon: null,
    });
    const rows = buildHomepageRows(
      {
        pages: [
          page("parent", null, true),
          page("child", "parent", false),
          page("grandchild", "child", false),
          page("sibling", "parent", false),
        ],
        databases: [],
        placements: [
          {
            id: "child-placement",
            itemKind: "page",
            itemId: "child",
            parentKind: "page",
            parentId: "parent",
            placementKind: "primary",
            position: 2,
          },
          {
            id: "sibling-placement",
            itemKind: "page",
            itemId: "sibling",
            parentKind: "page",
            parentId: "parent",
            placementKind: "primary",
            position: 1,
          },
        ],
      },
      [],
      [],
      "home",
      [teamspace("team-a"), teamspace("empty")],
    );
    const subItems = {
      display: "nested",
      enabled: true,
      filter: "parents-only",
      parentPropertyId: libraryParentPropertyId,
      property: "parent-item",
    };
    const viewConfigs = {
      favourites: { subItems },
      teamspaces: { subItems },
    };
    const viewData = (activeViewId) =>
      buildHomepageViewData({
        activeViewId,
        databaseConfig: {},
        mode: "home",
        workspaceId: "workspace",
        propertyConfigs: {},
        rows,
        viewConfigs,
      });
    const teamspaceModel = deriveDatabaseViewModel({
      activeViewId: "teamspaces",
      viewData: viewData("teamspaces"),
    });
    assert.deepEqual(
      teamspaceModel.sortedItems.map((row) => row.id),
      [
        "teamspace:team-a",
        "page:parent",
        "page:sibling",
        "page:child",
        "page:grandchild",
        "teamspace:empty",
      ],
    );
    assert.equal(teamspaceModel.subItemDepthByRowId["page:grandchild"], 3);

    const favouriteModel = deriveDatabaseViewModel({
      activeViewId: "favourites",
      viewData: viewData("favourites"),
    });
    assert.deepEqual(
      favouriteModel.sortedItems.map((row) => row.id),
      ["page:parent", "page:sibling", "page:child", "page:grandchild"],
    );
    assert.equal(favouriteModel.subItemDepthByRowId["page:grandchild"], 2);
  });
  test("library synthetic payload retains source summaries, view order and trash properties", async () => {
    const { buildHomepageRows, buildHomepageViewData } = await load();
    const rows = buildHomepageRows(
      {
        pages: [{ id: "p", name: "Page", createdAt: "", updatedAt: "", metadata: {} }],
        databases: [],
        placements: [],
      },
      [],
      [],
      "home",
    );
    const viewData = buildHomepageViewData({
      activeViewId: "recents",
      databaseConfig: { nameColumn: { label: "Name" } },
      mode: "home",
      workspaceId: "workspace",
      propertyConfigs: { source: { custom: true } },
      rows,
      viewConfigs: { recents: { sorts: [] } },
    });
    assert.equal(viewData.bootstrap.database.id, "homepage");
    assert.deepEqual(
      viewData.bootstrap.views.map((view) => view.id),
      [
        "recents",
        "favourites",
        "meetings",
        "skills",
        "instructions",
        "shared",
        "teamspaces",
        "private",
        "trash",
      ],
    );
    assert.equal(viewData.records[0].id, "page:p");
    assert.equal(viewData.bootstrap.properties[0].property.config.custom, true);
    assert.deepEqual(viewData.bootstrap.views[0].config, { sorts: [] });
    const trash = buildHomepageViewData({
      activeViewId: "trash",
      databaseConfig: {},
      mode: "trash",
      workspaceId: null,
      propertyConfigs: {},
      rows: [],
      viewConfigs: {},
    });
    assert.equal(trash.bootstrap.database.id, "trash");
    assert.deepEqual(
      trash.bootstrap.properties.slice(-2).map((property) => property.id),
      ["deletedAt", "deletedBy"],
    );
  });
  test("library database rows retain backing-page audit and source fallbacks", async () => {
    const { buildHomepageRows } = await load();
    const backing = {
      id: "backing",
      name: "Parent",
      type: "page",
      createdAt: "page-created",
      updatedAt: "page-updated",
      createdBy: { name: "", email: "owner@test" },
      deletedBy: { name: "Deleter" },
      deletedAt: "deleted",
      isShared: true,
      teamspaceId: "team",
      metadata: { emoji: "page-icon" },
    };
    const database = {
      id: "db",
      pageId: "backing",
      name: "Database",
      createdAt: "db-created",
      updatedAt: "db-updated",
      isFavorite: true,
      dataSourceConfig: { emoji: "database-icon" },
    };
    const navigation = { pages: [backing], databases: [database], placements: [] };
    assert.deepEqual(buildHomepageRows(navigation, [], [], "home"), []);
    const row = buildHomepageRows(navigation, [], [], "trash").find(
      (row) => row.itemKind === "database",
    );
    assert.equal(row.createdBy, "owner@test");
    assert.equal(row.deletedAt, "deleted");
    assert.equal(row.deletedBy, "Deleter");
    assert.equal(row.teamspaceId, "team");
    assert.equal(row.source, "page:backing");
    assert.equal(row.sourcePage.name, "Parent");
    assert.deepEqual(row.metadata, { emoji: "database-icon" });
    assert.equal(row.openDatabaseId, "db");
    assert.equal(row.openPageId, "backing");
    assert.equal(row.position, Number.MAX_SAFE_INTEGER);
  });
}
