export function register({ assert, loadModule, test }) {
  test("sidebar expansion is scoped by workspace and section", async () => {
    const { getSidebarExpansionStorageKey } = await loadModule(
      "/src/app/shell/sidebar/hooks/sidebar-controller.ts",
      ["getSidebarExpansionStorageKey"],
    );

    assert.equal(
      getSidebarExpansionStorageKey("workspace/one", "private"),
      "zilobase:sidebar-tree:v1:workspace%2Fone:private",
    );
    assert.notEqual(
      getSidebarExpansionStorageKey("workspace/one", "private"),
      getSidebarExpansionStorageKey("workspace/one", "favorites"),
    );
    assert.notEqual(
      getSidebarExpansionStorageKey("workspace/one", "private"),
      getSidebarExpansionStorageKey("workspace/two", "private"),
    );
  });

  test("sidebar expansion safely round trips expanded items", async () => {
    const { readExpandedSidebarItems, setSidebarItemExpanded, writeExpandedSidebarItems } =
      await loadModule("/src/app/shell/sidebar/hooks/sidebar-controller.ts", [
        "readExpandedSidebarItems",
        "setSidebarItemExpanded",
        "writeExpandedSidebarItems",
      ]);
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
    const storageKey = "sidebar-test";

    let expanded = setSidebarItemExpanded(new Set(), "parent", true);
    expanded = setSidebarItemExpanded(expanded, "child", true);
    expanded = setSidebarItemExpanded(expanded, "parent", false);
    writeExpandedSidebarItems(storageKey, expanded, storage);

    assert.deepEqual(readExpandedSidebarItems(storageKey, storage), ["child"]);
  });

  test("sidebar expansion ignores invalid or unavailable storage", async () => {
    const { readExpandedSidebarItems } = await loadModule(
      "/src/app/shell/sidebar/hooks/sidebar-controller.ts",
      ["readExpandedSidebarItems"],
    );
    const blockedStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    assert.deepEqual(readExpandedSidebarItems("missing", blockedStorage), []);
  });
  test("sidebar storage helpers preserve active tabs, legacy payloads, write limits and blocked storage", async () => {
    const {
      readActiveSidebarTab,
      writeActiveSidebarTab,
      readExpandedSidebarItems,
      writeExpandedSidebarItems,
    } = await loadModule("/src/app/shell/sidebar/hooks/sidebar-controller.ts", [
      "readActiveSidebarTab",
      "writeActiveSidebarTab",
      "readExpandedSidebarItems",
      "writeExpandedSidebarItems",
    ]);
    const saved = Object.getOwnPropertyDescriptor(globalThis, "window");
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
    try {
      globalThis.window = { localStorage: storage };
      assert.equal(readActiveSidebarTab("workspace"), "home");
      assert.equal(writeActiveSidebarTab("workspace", "tab"), undefined);
      assert.equal(values.get("zilobase:sidebar-active-tab:workspace"), "tab");
      assert.equal(readActiveSidebarTab("workspace"), "tab");
      assert.equal(readActiveSidebarTab("another"), "home");
      values.set("legacy", JSON.stringify({ version: 1, expandedNodeIds: ["a", 1, "a", "b"] }));
      assert.deepEqual(readExpandedSidebarItems("legacy"), ["a", "b"]);
      writeExpandedSidebarItems(
        "bounded",
        Array.from({ length: 600 }, (_, index) => String(index)),
      );
      assert.equal(JSON.parse(values.get("bounded")).length, 500);
      values.set("legacy", "invalid json");
      assert.deepEqual(readExpandedSidebarItems("legacy"), []);
      const blocked = {
        getItem() {
          throw new Error("blocked");
        },
        setItem() {
          throw new Error("blocked");
        },
      };
      globalThis.window = { localStorage: blocked };
      assert.equal(readActiveSidebarTab("workspace"), "home");
      assert.doesNotThrow(() => writeActiveSidebarTab("workspace", "tab"));
      assert.doesNotThrow(() => writeExpandedSidebarItems("bounded", ["a"]));
      assert.deepEqual(readExpandedSidebarItems("bounded"), []);
      delete globalThis.window;
      assert.deepEqual(readExpandedSidebarItems("bounded"), []);
    } finally {
      if (saved) Object.defineProperty(globalThis, "window", saved);
      else delete globalThis.window;
    }
  });
}
