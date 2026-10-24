import ts from "typescript";
import { Effect } from "effect";
const controllerPath = "/src/app/shell/sidebar/hooks/sidebar-controller.ts";

export function register({ assert, loadModule, readSource, test }) {
  test("sidebar section models preserve placement identity, scopes and teamspace sorting", async () => {
    const { buildSidebarSections } = await loadModule(controllerPath, ["buildSidebarSections"]);
    const node = (id, name) => ({ id, name, pageId: id, pages: [], emoji: null, isShared: false });
    const linked = {
      ...node("same-page", "Linked"),
      navNodeId: "linked-placement",
      isLinked: true,
    };
    const base = {
      activeTabId: "home",
      workspaceId: "workspace",
      favorites: [linked],
      recents: [],
      meetings: [],
      pageSections: {
        privatePages: [node("z", "Zulu"), node("a", "Alpha")],
        teamspacePages: [],
        teamspacePagesById: { team: [linked] },
      },
      teamspaces: [
        { id: "hidden", name: "Hidden" },
        { id: "team", name: "Team", currentUserRole: "member" },
      ],
    };
    const section = (kind) => ({ id: kind, kind, sort: "alphabetical", limit: 10 });
    const sections = [
      section("favorites"),
      section("private"),
      section("shared"),
      section("teamspaces"),
    ];
    const models = buildSidebarSections({ ...base, sections });
    assert.deepEqual(
      models.map((model) => model.kind),
      ["favorites", "private", "teamspaces"],
    );
    assert.deepEqual(
      models[1].items.map((item) => item.id),
      ["a", "z"],
    );
    assert.equal(models[0].items[0], linked);
    assert.equal(models[0].itemCount, 1);
    const limited = buildSidebarSections({
      ...base,
      sections: [{ ...section("private"), limit: 1 }],
    })[0];
    assert.equal(limited.items.length, 1);
    assert.equal(limited.itemCount, 2);
    assert.equal(models[2].items[0].navNodeId, "linked-placement");
    assert.equal(models[0].treeKey, "zilobase:sidebar-tree:v1:workspace:favorites");
    assert.equal(models[2].treeKey, "zilobase:sidebar-section:workspace:home:teamspaces:team:tree");
    assert.notEqual(
      buildSidebarSections({ ...base, sections, workspaceId: "next" })[1].storageKey,
      models[1].storageKey,
    );
    assert.notEqual(
      buildSidebarSections({ ...base, sections, activeTabId: "work" })[1].storageKey,
      models[1].storageKey,
    );
    assert.deepEqual(
      base.pageSections.privatePages.map((item) => item.id),
      ["z", "a"],
      "sorting must not mutate canonical navigation",
    );
  });

  test("database view selection distinguishes owner, explicit view and inline meeting routes", async () => {
    const { getDefaultViewIds, isActiveItem } = await loadModule(controllerPath, [
      "getDefaultViewIds",
      "isActiveItem",
    ]);
    const { getActiveMeetingId } = await loadModule("/src/app/routing/route-identifiers.ts");
    const node = {
      id: "db",
      databaseId: "owner",
      isDatabase: true,
      pages: [
        { id: "v1", databaseId: "owner", databaseViewId: "first", isDatabaseView: true, pages: [] },
        {
          id: "v2",
          databaseId: "owner",
          databaseViewId: "second",
          isDatabaseView: true,
          pages: [],
        },
      ],
    };
    const defaults = getDefaultViewIds([node]);
    assert.equal(isActiveItem(node.pages[0], null, null, "owner", null, defaults), true);
    assert.equal(isActiveItem(node.pages[1], null, null, "owner", "second", defaults), true);
    assert.equal(isActiveItem(node.pages[0], null, null, "owner", "second", defaults), false);
    assert.equal(isActiveItem({ pageId: "page" }, "page", "meeting", null, null, defaults), false);
    assert.equal(getActiveMeetingId("/m/meeting%20one"), "meeting one");
  });

  test("database sections resolve item availability while collapsed with a resolved source and view", async () => {
    const run = await probeFunction(readSource, "useSidebarDatabaseSection");
    let open = true;
    let view = { id: "view" };
    const calls = [];
    const ports = {
      React: { useMemo: (callback) => callback() },
      useSidebarSectionOpen: () => [open, () => {}],
      useDatabaseMetadata: (id, options) => {
        calls.push(["metadata", id, options]);
        return {
          data: {
            database: { name: "Database" },
            activeDataSource: { id: "source" },
            views: view ? [view] : [],
          },
        };
      },
      useDatabaseRecords: (input) => {
        calls.push(["records", input]);
        return { records: [], hasMore: false };
      },
      composeDatabaseViewData: (input) => input,
      useAddDatabaseRow: () => ({}),
      getDatabaseViewModel: () => ({ sortedItems: [{ id: "one" }, { id: "two" }] }),
    };
    const input = {
      storageKey: "section",
      section: { kind: "databaseView", databaseId: "owner", viewId: "view", limit: 1 },
    };
    const model = run(ports)(input);
    assert.deepEqual(calls, [
      ["metadata", "owner", { viewId: "view" }],
      ["records", { databaseId: "owner", dataSourceId: "source", viewId: "view" }],
    ]);
    assert.equal(model.rows.length, 1);
    assert.equal(model.hasMore, true);
    calls.length = 0;
    open = false;
    run(ports)(input);
    assert.equal(calls[0][1], "owner");
    assert.deepEqual(calls[1], [
      "records",
      { databaseId: "owner", dataSourceId: "source", viewId: "view" },
    ]);
    calls.length = 0;
    open = true;
    view = null;
    run(ports)(input);
    assert.deepEqual(calls[1], ["records", null]);
  });

  test("page links preserve prefetch timing, drag payloads and timer cleanup", async () => {
    const run = await probeFunction(readSource, "useSidebarPageLinks");
    const saved = Object.getOwnPropertyDescriptor(globalThis, "window");
    const timers = new Map();
    let next = 0;
    let cleanup;
    const calls = [];
    const ref = { current: new Map() };
    try {
      globalThis.window = {
        setTimeout: (callback, delay) => {
          const id = ++next;
          timers.set(id, { callback, delay });
          return id;
        },
        clearTimeout: (id) => timers.delete(id),
      };
      const ports = {
        React: {
          useRef: () => ref,
          useEffect: (callback) => {
            cleanup = callback();
          },
        },
        DATABASE_PAGE_DRAG_MIME: "page-drag",
        prefetchPageForNavigation: (id) => calls.push(["prefetch", id]),
        markPageNavigationStart: (id) => calls.push(["navigate", id]),
        hasDraggedPagePayload: () => true,
        getDraggedPagePayload: () => ({ pageId: "page", title: "Title" }),
      };
      const link = run(ports)({
        databaseDropTargetId: null,
        onDatabaseDropTargetChange: (id) => calls.push(["target", id]),
        onDropPageOnDatabase: (input) => calls.push(["drop", input]),
      });
      const item = { id: "page", pageId: "page", name: "Page" };
      const props = link({ displayName: "Page", item });
      props.onPointerEnter();
      assert.equal([...timers.values()][0].delay, 120);
      props.onPointerLeave();
      assert.equal(timers.size, 0);
      props.onFocus();
      assert.deepEqual(calls, [["prefetch", "page"]]);
      props.onClick({ button: 0, metaKey: true });
      assert.equal(calls.length, 1);
      props.onClick({ button: 0 });
      assert.deepEqual(calls.at(-1), ["navigate", "page"]);
      const data = [];
      props.onDragStart({ dataTransfer: { setData: (...input) => data.push(input) } });
      assert.deepEqual(data[0], ["page-drag", JSON.stringify({ pageId: "page", title: "Page" })]);
      const database = link({
        displayName: "Database",
        item: { id: "database", databaseId: "source", pageId: "owner", isDatabase: true },
      });
      database.onDrop({ preventDefault() {}, stopPropagation() {}, dataTransfer: {} });
      assert.deepEqual(calls.at(-1), [
        "drop",
        { databaseId: "source", pageId: "page", targetPageId: "owner", title: "Title" },
      ]);
      props.onPointerEnter();
      cleanup();
      assert.equal(timers.size, 0, "unmount clears outstanding prefetch work");
    } finally {
      if (saved) Object.defineProperty(globalThis, "window", saved);
      else delete globalThis.window;
    }
  });

  test("layout save closes customization only after success in the current identity", async () => {
    const source = await readSource(controllerPath);
    const ast = ts.createSourceFile("controller.ts", source, ts.ScriptTarget.Latest, true);
    let declaration;
    const visit = (node) => {
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "saveLayout")
        declaration = node.getText(ast);
      ts.forEachChild(node, visit);
    };
    visit(ast);
    const code = ts.transpileModule("const " + declaration + ";", {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const capture = new Function(
      "ports",
      `const {React,Effect,workspaceId,updateUserSettings,withSidebarWorkspaceLayout,sidebarConfig,storedLayout,restoreUnconfiguredIntegrationTabs,sidebarAvailability,setCustomizing,sidebarScope}=ports; ${code}; return saveLayout;`,
    );
    const calls = [];
    let resolve;
    let reject;
    const scope = { current: "workspace" };
    const ports = {
      React: { useCallback: (callback) => callback },
      Effect,
      workspaceId: "workspace",
      sidebarScope: scope,
      updateUserSettings: {
        mutateAsync: (input) => {
          calls.push(input);
          return new Promise((yes, no) => {
            resolve = yes;
            reject = no;
          });
        },
      },
      withSidebarWorkspaceLayout: (_config, workspaceId, layout) => ({ workspaceId, layout }),
      restoreUnconfiguredIntegrationTabs: (_stored, layout) => layout,
      sidebarConfig: {},
      storedLayout: {},
      sidebarAvailability: {},
      setCustomizing: (value) => calls.push(["customizing", value]),
    };
    let pending = capture(ports)({ tabs: [] });
    assert.equal(calls.length, 1);
    resolve();
    await pending;
    assert.deepEqual(calls.at(-1), ["customizing", false]);
    calls.length = 0;
    pending = capture(ports)({ tabs: [] });
    const error = new Error("Save denied");
    reject(error);
    await assert.rejects(pending, (failure) => failure === error);
    assert.equal(calls.length, 1);
    calls.length = 0;
    pending = capture(ports)({ tabs: [] });
    scope.current = "next workspace";
    resolve();
    await pending;
    assert.equal(calls.length, 1, "late save cannot close another workspace's customization");
  });
}

async function probeFunction(readSource, name) {
  const source = await readSource(controllerPath);
  const ast = ts.createSourceFile("controller.ts", source, ts.ScriptTarget.Latest, true);
  const node = ast.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  const code = ts.transpileModule(node.getText(ast).replace("export ", ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return (ports) =>
    new Function(...Object.keys(ports), `${code}; return ${name};`)(...Object.values(ports));
}
