export function register({ assert, loadModule, test }) {
  test("sidebar layout entries reorder and move without changing unrelated tabs", async () => {
    const { moveArrayItem, moveLayoutEntry } = await loadModule(
      "/packages/features/src/user-settings/index.ts",
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
    assert.equal(moveLayoutEntry(layout, "home", "missing", "shortcuts", "two"), layout);
    const duplicate = {
      ...layout,
      tabs: layout.tabs.map((tab) =>
        tab.id === "work" ? { ...tab, shortcuts: [layout.tabs[0].shortcuts[1]] } : tab,
      ),
    };
    assert.equal(moveLayoutEntry(duplicate, "home", "work", "shortcuts", "two"), duplicate);
    assert.equal(moveLayoutEntry(layout, "home", "ai", "shortcuts", "two"), layout);
    assert.equal(moveLayoutEntry(layout, "home", "calendar", "shortcuts", "two"), layout);
  });

  test("exact shortcuts are deduplicated only within the current tab", async () => {
    const { hasShortcutTarget } = await loadModule("/packages/features/src/user-settings/index.ts");
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
      "/src/app/shell/sidebar/hooks/sidebar-controller.ts",
      ["isShortcutActive"],
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
      await loadModule("/packages/features/src/user-settings/index.ts");
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

  test("Ask AI tab stays hidden while the feature flag is off and returns on save", async () => {
    const { hideUnconfiguredIntegrationTabs, restoreUnconfiguredIntegrationTabs } =
      await loadModule("/packages/features/src/user-settings/index.ts");
    const layout = {
      tabs: [
        { icon: "home", id: "home", name: "Home", sections: [], shortcuts: [] },
        {
          icon: "sparkles",
          id: "ai",
          name: "AI",
          sections: [{ id: "chats", kind: "aiChats", limit: 50, sort: "lastEdited" }],
          shortcuts: [{ id: "new-chat", target: { action: "createChat", type: "action" } }],
        },
        { icon: "calendar", id: "calendar", name: "Calendar", sections: [], shortcuts: [] },
      ],
      taskDatabaseIds: [],
    };

    const hidden = hideUnconfiguredIntegrationTabs(layout, { askAi: false, calendar: true });
    assert.deepEqual(
      hidden.tabs.map((tab) => tab.id),
      ["home", "calendar"],
    );

    const restored = restoreUnconfiguredIntegrationTabs(layout, hidden, {
      askAi: false,
      calendar: true,
    });
    assert.deepEqual(
      restored.tabs.map((tab) => tab.id),
      ["home", "ai", "calendar"],
    );
  });

  test("Tasks shortcuts and sections stay hidden while the feature flag is off and return on save", async () => {
    const { hideUnconfiguredIntegrationTabs, restoreUnconfiguredIntegrationTabs } =
      await loadModule("/packages/features/src/user-settings/index.ts");
    const recents = { id: "recents", kind: "recents", limit: 5, sort: "lastEdited" };
    const tasks = { id: "tasks", kind: "tasks", limit: 10, sort: "lastEdited" };
    const library = { id: "library", target: { type: "library", view: "recents" } };
    const tasksShortcut = { id: "tasks", target: { route: "tasks", type: "route" } };
    const layout = {
      tabs: [
        {
          icon: "home",
          id: "home",
          name: "Home",
          sections: [tasks, recents],
          shortcuts: [library, tasksShortcut],
        },
      ],
      taskDatabaseIds: ["db"],
    };
    const availability = { calendar: true, tasks: false };

    const hidden = hideUnconfiguredIntegrationTabs(layout, availability);
    assert.deepEqual(hidden.tabs[0].sections, [recents]);
    assert.deepEqual(hidden.tabs[0].shortcuts, [library]);
    assert.deepEqual(hidden.taskDatabaseIds, ["db"]);

    const restored = restoreUnconfiguredIntegrationTabs(layout, hidden, availability);
    assert.deepEqual(restored.tabs[0].sections, [tasks, recents]);
    assert.deepEqual(restored.tabs[0].shortcuts, [library, tasksShortcut]);

    const visible = hideUnconfiguredIntegrationTabs(layout, { calendar: true, tasks: true });
    assert.deepEqual(visible.tabs[0].sections, [tasks, recents]);
  });
}
