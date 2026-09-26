export function register({ assert, loadModule, test }) {
  test("sidebar layout entries reorder and move without changing unrelated tabs", async () => {
    const { moveArrayItem, moveLayoutEntry } = await loadModule(
      "/src/features/sidebar/model/sidebar-layout-model.ts",
    );
    const layout = {
      tabs: [
        {
          icon: "home",
          id: "home",
          name: "Home",
          sections: [],
          shortcuts: [
            { id: "one", target: { route: "ai", type: "route" } },
            { id: "two", target: { route: "tasks", type: "route" } },
          ],
        },
        { icon: "sparkles", id: "ai", name: "AI", sections: [], shortcuts: [] },
        { icon: "star", id: "work", name: "Work", sections: [], shortcuts: [] },
      ],
      taskDatabaseIds: [],
    };

    assert.deepEqual(moveArrayItem(["one", "two"], 1, -1), ["two", "one"]);
    const moved = moveLayoutEntry(layout, "home", "work", "shortcuts", "two");
    assert.deepEqual(
      moved.tabs[0].shortcuts.map((item) => item.id),
      ["one"],
    );
    assert.deepEqual(
      moved.tabs[2].shortcuts.map((item) => item.id),
      ["two"],
    );
    assert.equal(moveLayoutEntry(layout, "home", "ai", "shortcuts", "two"), layout);
    assert.equal(moveLayoutEntry(layout, "home", "calendar", "shortcuts", "two"), layout);
  });

  test("exact shortcuts are deduplicated only within the current tab", async () => {
    const { hasShortcutTarget } = await loadModule(
      "/src/features/sidebar/model/sidebar-layout-model.ts",
    );
    const tab = {
      icon: "home",
      id: "home",
      name: "Home",
      sections: [],
      shortcuts: [{ id: "one", target: { type: "library", view: "recents" } }],
    };
    assert.equal(hasShortcutTarget(tab, { type: "library", view: "recents" }), true);
    assert.equal(hasShortcutTarget(tab, { type: "library", view: "private" }), false);
  });

  test("shortcuts are active only for their current route and library view", async () => {
    const { isShortcutActive } = await loadModule(
      "/src/features/sidebar/model/sidebar-layout-model.ts",
    );
    const shortcut = (target) => ({ id: "shortcut", target });

    assert.equal(
      isShortcutActive(shortcut({ type: "library", view: "meetings" }), "/recents", {
        view: "meetings",
      }),
      true,
    );
    assert.equal(
      isShortcutActive(shortcut({ type: "library", view: "recents" }), "/recents", {
        view: "meetings",
      }),
      false,
    );
    assert.equal(
      isShortcutActive(shortcut({ type: "library", view: "trash" }), "/recents", { view: "trash" }),
      true,
    );
    assert.equal(
      isShortcutActive(shortcut({ type: "route", route: "meetings" }), "/recents", {
        view: "meetings",
      }),
      true,
    );
    assert.equal(isShortcutActive(shortcut({ type: "route", route: "tasks" }), "/tasks", {}), true);
    assert.equal(
      isShortcutActive(shortcut({ type: "route", route: "settings" }), "/recents", {}, true),
      true,
    );
    assert.equal(
      isShortcutActive(shortcut({ type: "action", action: "createPage" }), "/recents", {}),
      false,
    );
  });

  test("calendar tab stays hidden until its server environment is configured", async () => {
    const { hideUnconfiguredIntegrationTabs, restoreUnconfiguredIntegrationTabs } =
      await loadModule("/src/features/sidebar/model/sidebar-layout-model.ts");
    const layout = {
      tabs: [
        {
          icon: "home",
          id: "home",
          name: "Home",
          sections: [],
          shortcuts: [{ id: "tasks", target: { route: "tasks", type: "route" } }],
        },
        { icon: "calendar", id: "calendar", name: "Calendar", sections: [], shortcuts: [] },
      ],
      taskDatabaseIds: ["tasks"],
    };

    const hidden = hideUnconfiguredIntegrationTabs(layout, { calendar: false });
    assert.deepEqual(
      hidden.tabs.map((tab) => tab.id),
      ["home"],
    );
    assert.deepEqual(hidden.tabs[0].shortcuts, [
      { id: "tasks", target: { route: "tasks", type: "route" } },
    ]);

    const restored = restoreUnconfiguredIntegrationTabs(layout, hidden, { calendar: false });
    assert.deepEqual(
      restored.tabs.map((tab) => tab.id),
      ["home", "calendar"],
    );
  });
}
