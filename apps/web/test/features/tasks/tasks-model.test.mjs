import { readFile } from "node:fs/promises";

export function register({ readSource, assert, loadModule, test }) {
  test("Tasks uses the shared database list view", async () => {
    const [source, listView, dataSourceSettings, styles] = await Promise.all([
      readSource("/src/features/tasks/pages/tasks.tsx"),
      readSource("/src/features/databases/views/list/view/database-list-view.tsx"),
      readSource("/src/features/databases/views/view-settings/view/data-source-settings.tsx"),
      readSource("/src/features/databases/styles/database.css"),
    ]);

    assert.match(source, /<DatabaseViewProvider/);
    assert.match(source, /<DatabaseViewToolbar/);
    assert.match(source, /<DatabaseListView/);
    assert.match(source, /newRowLabel: "New task"/);
    assert.match(source, /setRowComplete:/);
    assert.match(source, /addDatabaseRow: createTask/);
    assert.match(source, /optimisticValues: initialValues/);
    assert.match(source, /configureDataSources: onConfigureDataSources/);
    assert.match(
      source,
      /addDataSource: \(\) => setDataSourceSetupOpen\(true\)/,
    );
    assert.match(source, /dataSources: payloads\.flatMap/);
    assert.match(source, /<DatabaseSetupCard/);
    assert.match(source, /onSelectDataSource=\{onSelectDataSource\}/);
    assert.doesNotMatch(source, /TasksPageHeader\(\{ onConfigure \}/);
    assert.doesNotMatch(source, /NewTaskDialog/);
    assert.match(source, /text-4xl font-semibold leading-tight/);
    assert.match(source, /md:px-20 lg:px-24/);
    assert.match(source, /showTitle: false/);
    assert.doesNotMatch(source, /max-w-7xl/);
    assert.match(listView, /className="database-list-row-checkbox"/);
    assert.match(
      dataSourceSettings,
      /displayMode="inline"[\s\S]*?title="Source"[\s\S]*?label="Source"/,
    );
    assert.doesNotMatch(dataSourceSettings, /Configure data sources/);
    assert.match(
      dataSourceSettings,
      /disabled=\{!onAddDataSource \|\| isAddingDataSource\}/,
    );
    assert.match(
      styles,
      /\.database-list-drag-handle\s*\{[\s\S]*?@apply absolute left-\[-2rem\]/,
    );
  });

  test("task databases require status, assignee, and due date properties", async () => {
    const { getTaskDatabaseSchema } = await loadModule(
      "/src/features/tasks/model/tasks-model.ts",
    );
    const payload = createPayload({
      properties: [
        createProperty("state", "Workflow", "status"),
        createProperty("owner", "Owner", "person"),
      ],
    });

    assert.deepEqual(getTaskDatabaseSchema(payload).missing, ["Due date"]);
  });

  test("task rows aggregate typed values and sort undated work last", async () => {
    const { buildTaskRows, sortTaskRows } = await loadModule(
      "/src/features/tasks/model/tasks-model.ts",
    );
    const first = createPayload({
      databaseId: "product",
      name: "Product",
      rows: [createRow("later", "Later task"), createRow("soon", "Soon task")],
      values: [
        createValue("later", "state", "In progress"),
        createValue("later", "owner", ["user-1"]),
        createValue("soon", "state", "Not started"),
        createValue("soon", "owner", [{ id: "user-1" }]),
        createValue("soon", "deadline", { start: "2026-09-01" }),
      ],
    });
    const rows = sortTaskRows(buildTaskRows([first]));

    assert.deepEqual(
      rows.map((row) => row.title),
      ["Soon task", "Later task"],
    );
    assert.deepEqual(rows[0].assigneeIds, ["user-1"]);
    assert.equal(rows[0].dueDate, "2026-09-01");
    assert.equal(rows[0].databaseName, "Product");
  });

  test("task completion follows status groups and restores the default status", async () => {
    const { buildTaskRows, filterMyTaskRows, getTaskStatusForCompletion } =
      await loadModule("/src/features/tasks/model/tasks-model.ts");
    const payload = createPayload({
      properties: [
        createProperty("state", "Status", "status", {
          defaultOptionId: "backlog",
          options: [
            { group: "To-do", id: "backlog", name: "Backlog" },
            { group: "In progress", id: "active", name: "Active" },
            { group: "Complete", id: "shipped", name: "Shipped" },
          ],
        }),
        createProperty("owner", "Assignee", "person"),
        createProperty("deadline", "Due date", "date"),
      ],
      rows: [createRow("release", "Release")],
      values: [createValue("release", "state", "Shipped")],
    });

    const rows = buildTaskRows([payload]);

    assert.equal(rows[0].isCompleted, true);
    assert.deepEqual(filterMyTaskRows(rows, null), []);
    assert.equal(getTaskStatusForCompletion(payload, true), "Shipped");
    assert.equal(getTaskStatusForCompletion(payload, false), "Backlog");
  });
}

function createPayload({
  databaseId = "tasks",
  name = "Tasks",
  properties = [
    createProperty("state", "Status", "status", {
      options: [{ id: "not-started", name: "Not started" }],
    }),
    createProperty("owner", "Assignee", "person"),
    createProperty("deadline", "Due date", "date"),
  ],
  rows = [],
  values = [],
}) {
  return {
    database: {
      createdAt: "",
      id: databaseId,
      name,
      pageId: null,
      updatedAt: "",
      version: 1,
      workspaceId: "workspace",
    },
    properties,
    rows,
    values,
    views: [],
  };
}

function createProperty(id, name, type, config) {
  return {
    createdAt: "",
    databaseId: "tasks",
    id: `column:${id}`,
    position: 0,
    property: {
      config,
      createdAt: "",
      id,
      name,
      type,
      updatedAt: "",
      workspaceId: "workspace",
    },
    propertyId: id,
    updatedAt: "",
    visible: true,
  };
}

function createRow(id, name) {
  return {
    createdAt: "",
    databaseId: "tasks",
    id: `row:${id}`,
    page: { id, name },
    pageId: id,
    position: 0,
    updatedAt: "",
  };
}

function createValue(pageId, propertyId, value) {
  return {
    createdAt: "",
    id: `${pageId}:${propertyId}`,
    pageId,
    propertyId,
    updatedAt: "",
    value,
  };
}
