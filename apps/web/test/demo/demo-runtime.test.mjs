export function register({ assert, loadModule, test }) {
  test("demo receipts replay exactly and local reads retain moves, values and sparse settings", async () => {
    const { DemoDatabaseRuntime, demoDatabaseFixture, databaseViewQueryHash } = await loadModule(
      "/apps/web/test/support/demo-transport.ts",
    );
    const runtime = new DemoDatabaseRuntime(() => new Error("unsupported"));
    const { bootstrap, window } = demoDatabaseFixture();
    const url = (path) => new URL(path, "https://demo.localhost");
    const bootstrapUrl = url("/databases/demo-db/bootstrap");
    const recordUrl = url(
      `/databases/demo-db/data-sources/demo-source/records?viewId=table&expectedQueryHash=${window.queryHash}`,
    );
    runtime.capture(bootstrapUrl, bootstrap);
    runtime.capture(recordUrl, window);
    const sourceUrl = url("/databases/demo-db/data-sources/demo-source/commands");
    const hostUrl = url("/databases/demo-db/commands");
    const command = (commandId, value) => ({ commandId, protocolVersion: 2, command: value });
    const move = command("move", {
      type: "row.change",
      rowId: "demo-row",
      placement: { afterRowId: "other-row", beforeRowId: null },
      valuesByPropertyId: { "demo-status": "Done" },
    });
    const ack = runtime.command(sourceUrl, move);
    assert.deepEqual(runtime.command(sourceUrl, move), ack);
    assert.equal(ack.sourceVersions["demo-source"], 8);
    assert.throws(
      () =>
        runtime.command(sourceUrl, { ...move, command: { ...move.command, title: "Different" } }),
      (error) => error.body.code === "COMMAND_ID_REUSED",
    );
    assert.deepEqual(
      runtime.read(recordUrl).records.map(({ id }) => id),
      ["other-row", "demo-row"],
    );
    runtime.capture(recordUrl, window);
    runtime.capture(bootstrapUrl, bootstrap);
    assert.equal(
      runtime.read(recordUrl).records[1].valuesByPropertyId["demo-status"].value,
      "Done",
    );
    assert.equal(window.records[0].valuesByPropertyId["demo-status"], undefined);
    runtime.command(
      hostUrl,
      command("sort", {
        type: "view.update",
        viewId: "table",
        patch: {
          configuration: [
            {
              operation: "set",
              path: ["sorts"],
              value: [{ column: "name", direction: "ascending" }],
            },
          ],
        },
      }),
    );
    assert.throws(
      () => runtime.read(recordUrl),
      (error) => error.body.code === "VIEW_QUERY_CHANGED",
    );
    const sortedUrl = new URL(recordUrl);
    sortedUrl.searchParams.set(
      "expectedQueryHash",
      databaseViewQueryHash(runtime.read(bootstrapUrl).views[0].config),
    );
    assert.deepEqual(
      runtime.read(sortedUrl).records.map(({ id }) => id),
      ["demo-row", "other-row"],
    );
    runtime.command(
      sourceUrl,
      command("unsort-move", {
        type: "row.change",
        rowId: "demo-row",
        clearSortViewId: "table",
        placement: { afterRowId: "other-row", beforeRowId: null },
      }),
    );
    assert.deepEqual(
      runtime.read(recordUrl).records.map(({ id }) => id),
      ["other-row", "demo-row"],
    );
    runtime.command(
      sourceUrl,
      command("property", {
        type: "property.update",
        propertyId: "column",
        patch: { name: "Phase", width: 240 },
      }),
    );
    assert.equal(runtime.read(bootstrapUrl).properties[0].property.name, "Phase");
    assert.equal(runtime.read(bootstrapUrl).properties[0].width, 240);
    const linked = structuredClone(bootstrap);
    linked.database.id = "linked-host";
    linked.views = linked.views.map((view) => ({ ...view, databaseId: "linked-host" }));
    const linkedUrl = url("/databases/linked-host/bootstrap");
    runtime.capture(linkedUrl, linked);
    assert.equal(runtime.read(linkedUrl).properties[0].property.name, "Phase");
    const linkedRecords = new URL(recordUrl);
    linkedRecords.pathname = linkedRecords.pathname.replace("demo-db", "linked-host");
    assert.deepEqual(
      runtime.read(linkedRecords).records.map(({ id }) => id),
      ["other-row", "demo-row"],
    );
    const before = runtime.read(bootstrapUrl);
    assert.throws(
      () =>
        runtime.command(
          sourceUrl,
          command("bad", {
            type: "row.change",
            rowId: "demo-row",
            title: "must not apply",
            clearSortViewId: "missing",
          }),
        ),
      /unsupported/,
    );
    assert.deepEqual(runtime.read(bootstrapUrl), before);
    assert.notEqual(runtime.read(recordUrl).records[1].page.name, "must not apply");
    assert.throws(
      () => runtime.command(hostUrl, command("archive", { type: "database.archive" })),
      /unsupported/,
    );
  });

  test("demo does not confirm writes from incomplete or filtered server windows", async () => {
    const { DemoDatabaseRuntime, demoDatabaseFixture } = await loadModule(
      "/apps/web/test/support/demo-transport.ts",
    );
    const runtime = new DemoDatabaseRuntime(() => new Error("unsupported"));
    const { bootstrap, window } = demoDatabaseFixture();
    runtime.capture(new URL("https://demo.localhost/databases/demo-db/bootstrap"), bootstrap);
    runtime.capture(
      new URL("https://demo.localhost/databases/demo-db/data-sources/demo-source/records"),
      { ...window, totalCount: 100, hasMore: true },
    );
    assert.throws(
      () =>
        runtime.command(
          new URL("https://demo.localhost/databases/demo-db/data-sources/demo-source/commands"),
          {
            protocolVersion: 2,
            commandId: "partial",
            command: { type: "row.change", rowId: "demo-row", title: "No" },
          },
        ),
      /unsupported/,
    );
  });

  test("hosted demo keeps supported page and database edits local", async () => {
    const originalWindow = globalThis.window;
    const demoWindow = new EventTarget();
    demoWindow.location = {
      hostname: "demo.zilobase.com",
    };
    globalThis.window = demoWindow;

    const runtime = await loadModule("/apps/web/test/support/demo-transport.ts");
    assert.equal(runtime.isHostedDemoRuntime({ hostname: "demo.localhost" }), true);
    assert.equal(
      runtime.isAllowedDemoParent(new URL("http://localhost:4321"), { hostname: "demo.localhost" }),
      true,
    );
    assert.equal(
      runtime.isAllowedDemoParent(new URL("https://unrelated.example"), {
        hostname: "demo.localhost",
      }),
      false,
    );
    const { bootstrap, window } = runtime.demoDatabaseFixture();
    runtime.applyDemoReadOverlay("/databases/demo-db/bootstrap", bootstrap);
    runtime.applyDemoReadOverlay("/databases/demo-db/data-sources/demo-source/records", window);
    const page = {
      page: { id: "demo-page", name: "Start here", updatedAt: "old" },
    };

    runtime.installDemoCache({
      getQueriesData: () => [],
      getQueryData: (key) => (key[0] === "page" ? page : undefined),
    });

    try {
      const cellResult = runtime.interceptDemoRequest(
        "/databases/demo-db/data-sources/demo-source/commands",
        "POST",
        JSON.stringify({
          commandId: "demo-command",
          command: {
            rowId: "demo-row",
            type: "row.change",
            valuesByPropertyId: { "demo-status": "In progress" },
          },
          protocolVersion: 2,
        }),
      );
      assert.equal(cellResult.handled, true);
      assert.equal(cellResult.value.commandId, "demo-command");
      assert.equal(cellResult.value.event.databaseId, "demo-db");
      assert.equal(cellResult.value.event.dataSourceId, "demo-source");
      assert.deepEqual(cellResult.value.event.areas, ["records"]);
      assert.match(cellResult.value.event.eventId, /^demo-local-/);
      assert.equal(cellResult.value.sourceVersions["demo-source"], 8);
      assert.equal(cellResult.value.result.valuesByPropertyId["demo-status"].value, "In progress");
      const read = runtime.interceptDemoRequest(
        `/databases/demo-db/data-sources/demo-source/records?viewId=table&expectedQueryHash=${window.queryHash}`,
        "GET",
      );
      assert.equal(read.handled, true);
      assert.equal(read.value.records[0].valuesByPropertyId["demo-status"].value, "In progress");

      const visitResult = runtime.interceptDemoRequest(
        "/pages/item-visits",
        "POST",
        JSON.stringify({
          itemId: "demo-page",
          itemKind: "page",
          workspaceId: "demo-workspace",
        }),
      );
      assert.equal(visitResult.handled, true);
      assert.equal(visitResult.value.itemId, "demo-page");
      assert.equal(visitResult.value.itemKind, "page");
      assert.match(visitResult.value.lastVisitedAt, /^\d{4}-\d{2}-\d{2}T/);

      const titleResult = runtime.interceptDemoRequest(
        "/pages/demo-page",
        "PATCH",
        JSON.stringify({ name: "Edited locally" }),
      );
      assert.equal(titleResult.handled, true);
      const pageOverlay = runtime.applyDemoReadOverlay("/pages/demo-page", page);
      assert.equal(pageOverlay.page.name, "Edited locally");
    } finally {
      if (originalWindow === undefined) delete globalThis.window;
      else globalThis.window = originalWindow;
    }
  });

  test("hosted demo guards unsupported writes and leaves normal origins unchanged", async () => {
    const originalWindow = globalThis.window;
    const demoWindow = new EventTarget();
    demoWindow.location = { hostname: "demo.zilobase.com" };
    globalThis.window = demoWindow;
    const runtime = await loadModule("/apps/web/test/support/demo-transport.ts");

    try {
      assert.throws(
        () =>
          runtime.interceptDemoRequest(
            "/ai/conversations/demo/messages",
            "POST",
            JSON.stringify({ prompt: "Run the model" }),
          ),
        (error) =>
          error instanceof Error &&
          error.name === "DemoGuardError" &&
          error.status === 403 &&
          error.body.code === "DEMO_READ_ONLY",
      );

      demoWindow.location = { hostname: "app.zilobase.com" };
      assert.deepEqual(
        runtime.interceptDemoRequest("/pages", "POST", JSON.stringify({ name: "Real page" })),
        { handled: false },
      );
    } finally {
      if (originalWindow === undefined) delete globalThis.window;
      else globalThis.window = originalWindow;
    }
  });
}
