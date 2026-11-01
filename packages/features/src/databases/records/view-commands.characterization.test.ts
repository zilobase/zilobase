import test, { type TestContext } from "node:test";

import type { DatabasePropertyEntity, DatabaseViewEntity } from "../core/entities";
import type { DatabaseRow } from "../core/export-payload";
import { getKanbanGroupProperty } from "../views/grouping";
import { getTimelineDateProperty } from "../views/timeline-date";
import type { DatabaseViewData } from "../views/source-state";
import type { DatabaseMutations } from "./mutation-bindings";
import { createDatabaseViewCommands } from "./view-commands";

/*
 * Characterizes the ordered operation calls each user intent issues, including
 * optimistic admission. Planner refactors must reproduce these snapshots.
 */

type Commands = ReturnType<typeof createDatabaseViewCommands>;
type Call = { op: string; optimistic?: true; input: unknown };

const now = "2026-09-08T00:00:00.000Z";
const property = (
  id: string,
  type: string,
  position: number,
  name = id,
): DatabasePropertyEntity => ({
  createdAt: now,
  dataSourceId: "source",
  id: `column-${id}`,
  position,
  property: { config: {}, createdAt: now, id, name, type, updatedAt: now, workspaceId: "org" },
  propertyId: id,
  updatedAt: now,
  visible: true,
  width: null,
});
const status = property("status", "status", 0, "Status");
const text = property("notes", "text", 1, "Notes");
const due = property("due", "date", 2, "Due");
const relation = {
  ...property("related", "relation", 3, "Related"),
  property: {
    ...property("related", "relation", 3, "Related").property,
    config: { relation: { relatedDatabaseId: "other", limit: "no_limit" } },
  },
};
const view = (type: string, config: Record<string, unknown> = {}): DatabaseViewEntity => ({
  config,
  createdAt: now,
  databaseId: "host",
  dataSourceId: "source",
  id: `view-${type}`,
  name: type[0]!.toUpperCase() + type.slice(1),
  position: 0,
  type,
  updatedAt: now,
});
const rows: DatabaseRow[] = [
  { id: "row-1", pageId: "page-1", page: { id: "page-1", name: "Alpha" } },
  { id: "row-2", pageId: "page-2", page: { id: "page-2", name: "Beta" } },
] as unknown as DatabaseRow[];

function setup(options: {
  activeView?: DatabaseViewEntity | null;
  editable?: boolean;
  properties?: DatabasePropertyEntity[];
  filters?: Array<{ id: string; operator: string; propertyId: string; values: string[] }>;
  sorts?: Array<{ column: string; direction: "ascending" | "descending" }>;
}) {
  const properties = options.properties ?? [status, text, due];
  const activeView = options.activeView === undefined ? view("table") : options.activeView;
  const calls: Call[] = [];
  let counter = 0;
  const record =
    <T>(op: string, result: (input: Record<string, unknown>) => T) =>
    async (raw: unknown) => {
      const { onOptimistic, ...input } = (raw ?? {}) as Record<string, unknown> & {
        onOptimistic?: (value: T) => void;
      };
      calls.push({ op, ...(onOptimistic ? { optimistic: true as const } : {}), input });
      const value = result(input);
      onOptimistic?.(value);
      await Promise.resolve();
      return value;
    };
  const mutations = {
    addProperty: record("addProperty", (input) => {
      counter += 1;
      return {
        ...property(`created-${counter}`, String(input.type), 10 + counter, String(input.name)),
      };
    }),
    updateProperty: record("updateProperty", () => status),
    addDatabaseView: record("addDatabaseView", (input) => ({
      ...view(String(input.type)),
      id: "view-created",
    })),
    updateDatabaseView: record("updateDatabaseView", () => activeView),
    updateDatabase: record("updateDatabase", () => ({})),
    addRow: record("addRow", () => ({ id: "row-created", pageId: "page-created" })),
    changeRow: record("changeRow", () => ({})),
    updateValue: record("updateValue", () => ({})),
  } as unknown as DatabaseMutations;
  const viewData = {
    activeDataSource: { id: "source", name: "Tasks", config: {} },
    bootstrap: {
      database: { id: "host", config: { emoji: "x" }, pageId: "host-page" },
      dataSources: [],
      properties,
      views: activeView ? [activeView] : [],
    },
    dataSourceId: "source",
    hasMore: false,
    records: [],
    totalCount: rows.length,
  } as unknown as DatabaseViewData;
  const selected: string[] = [];
  const errors: string[] = [];
  const kanbanGroupProperty =
    activeView?.type === "kanban"
      ? (getKanbanGroupProperty(properties, activeView.config) ?? null)
      : null;
  const timelineDateProperty =
    activeView?.type === "timeline"
      ? (getTimelineDateProperty(properties, activeView.config) ?? null)
      : null;
  const commands = createDatabaseViewCommands({
    activeDatabaseFilters: (options.filters ?? []) as never,
    activeDatabaseSorts: options.sorts ?? [],
    activeView,
    databaseId: "source",
    viewDatabaseId: "host",
    editable: options.editable ?? true,
    isKanbanView: activeView?.type === "kanban",
    items: rows,
    kanbanGroupProperty: kanbanGroupProperty as never,
    timelineDateProperty: timelineDateProperty as never,
    mutations,
    notify: { error: (message) => errors.push(message), success() {} },
    viewData,
    properties,
    onViewCreated: (id) => selected.push(id),
    onSortsChanged() {},
  });
  return { calls, commands, errors, selected };
}

async function settle() {
  for (let index = 0; index < 10; index += 1) await new Promise((resolve) => setTimeout(resolve));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortKeys(item)]),
  );
}

/** Key order is irrelevant to command receipts and servers; random filter IDs are masked. */
function normalize(value: unknown) {
  return sortKeys(
    JSON.parse(
      JSON.stringify(value).replace(/filter-[0-9a-f]{8}-[0-9a-f-]{27}/g, "filter-<random>"),
    ),
  );
}

async function capture(
  t: TestContext,
  scenarios: Record<string, [Parameters<typeof setup>[0], (commands: Commands) => unknown]>,
) {
  const results: Record<string, unknown> = {};
  for (const [name, [options, invoke]] of Object.entries(scenarios)) {
    const harness = setup(options);
    const returned = invoke(harness.commands);
    await settle();
    if (returned instanceof Promise) await returned.catch(() => undefined);
    results[name] = normalize({
      calls: harness.calls,
      errors: harness.errors,
      selected: harness.selected,
    });
  }
  t.assert.snapshot(results);
}

const kanban = view("kanban", { groupPropertyId: "status" });
const timeline = view("timeline", { datePropertyId: "due" });
const calendar = view("calendar", { datePropertyId: "due" });
const form = view("form", { hiddenPropertyIds: [] });
const filters = [
  { id: "filter-a", operator: "is", propertyId: "status", values: ["Done"] },
  { id: "filter-b", operator: "contains", propertyId: "notes", values: ["x"] },
];
const sorts = [
  { column: "status", direction: "ascending" as const },
  { column: "notes", direction: "descending" as const },
];

test("view creation intents", async (t) => {
  await capture(t, {
    table: [{}, (c) => c.addTableView()],
    list: [{}, (c) => c.addListView()],
    gallery: [{}, (c) => c.addGalleryView()],
    chart: [{}, (c) => c.addChartView()],
    form: [{}, (c) => c.addFormView(["column-notes"])],
    kanbanExisting: [{}, (c) => c.addKanbanView()],
    kanbanCreatesStatus: [{ properties: [text, due] }, (c) => c.addKanbanView()],
    timelineExisting: [{}, (c) => c.addTimelineView()],
    timelineCreatesDate: [{ properties: [status, text] }, (c) => c.addTimelineView()],
    calendarExisting: [{}, (c) => c.addCalendarView()],
    calendarCreatesDate: [{ properties: [status, text] }, (c) => c.addCalendarView()],
    readOnly: [{ editable: false }, (c) => c.addKanbanView()],
  });
});

test("view layout and grouping intents", async (t) => {
  await capture(t, {
    tableToKanban: [{}, (c) => c.setViewType("kanban")],
    tableToKanbanCreatesStatus: [{ properties: [text, due] }, (c) => c.setViewType("kanban")],
    tableToTimeline: [{}, (c) => c.setViewType("timeline")],
    tableToCalendarCreatesDate: [{ properties: [status, text] }, (c) => c.setViewType("calendar")],
    tableToList: [{}, (c) => c.setViewType("list")],
    kanbanToTable: [{ activeView: kanban }, (c) => c.setViewType("table")],
    sameType: [{}, (c) => c.setViewType("table")],
    groupByNotesOnKanban: [{ activeView: kanban }, (c) => c.setViewGroupProperty("notes")],
    ungroupTable: [
      { activeView: view("table", { groupPropertyId: "status" }) },
      (c) => c.setViewGroupProperty(null),
    ],
    datePropertyTimeline: [{ activeView: timeline }, (c) => c.setViewDateProperty("due")],
    calendarMode: [{ activeView: calendar }, (c) => c.setCalendarMode("week")],
    setupKanbanRequired: [
      { activeView: view("kanban"), properties: [text] },
      (c) => c.setupRequiredViewProperties(),
    ],
    setupTimelineRequired: [
      { activeView: view("timeline"), properties: [status] },
      (c) => c.setupRequiredViewProperties(),
    ],
    setupTimelineDate: [
      { activeView: view("timeline"), properties: [status] },
      (c) => c.setupTimelineDateProperty(),
    ],
  });
});

test("view filter and sort intents", async (t) => {
  await capture(t, {
    createSort: [{ sorts }, (c) => c.createDatabaseSort("due")],
    updateSort: [{ sorts }, (c) => c.updateDatabaseSort(1, { direction: "ascending" })],
    removeSort: [{ sorts }, (c) => c.removeDatabaseSort(0)],
    clearSort: [{ sorts }, (c) => c.clearDatabaseSort()],
    saveSorts: [{}, (c) => c.saveDatabaseSorts([{ column: "due", direction: "descending" }])],
    createFilter: [{ filters }, (c) => c.createDatabaseFilter("due")],
    createDuplicateFilter: [{ filters }, (c) => c.createDatabaseFilter("status")],
    updateFilterValues: [{ filters }, (c) => c.updateDatabaseFilter(0, { values: ["Todo"] })],
    updateFilterProperty: [{ filters }, (c) => c.updateDatabaseFilter(1, { propertyId: "due" })],
    updateFilterOperator: [
      { filters },
      (c) => c.updateDatabaseFilter(1, { operator: "does_not_contain" }),
    ],
    removeFilter: [{ filters }, (c) => c.removeDatabaseFilter(0)],
    reorderFilters: [{ filters }, (c) => c.reorderDatabaseFilters(["filter-b"])],
    clearFilter: [{ filters }, (c) => c.clearDatabaseFilter()],
    conditionalColors: [
      {},
      (c) =>
        c.saveDatabaseConditionalColors([
          { id: "color-1", color: "red", filters: [], applyTo: "entire-row" } as never,
        ]),
    ],
  });
});

test("view presentation intents", async (t) => {
  await capture(t, {
    propertyOrder: [{}, (c) => c.saveDatabasePropertyOrder(["column-due", "bogus", "name"])],
    toggleVisibility: [{}, (c) => c.togglePropertyVisibility("column-notes")],
    toggleVisibilityKanban: [
      { activeView: kanban },
      (c) => c.togglePropertyVisibility("column-notes"),
    ],
    togglePropertyTitles: [{}, (c) => c.togglePropertyTitles()],
    chartSettings: [
      { activeView: view("chart") },
      (c) => c.updateDatabaseChartSettings({ type: "bar" } as never),
    ],
    layoutSettings: [{}, (c) => c.updateDatabaseLayoutSettings({ wrapCells: true } as never)],
    subItems: [{}, (c) => c.updateDatabaseSubItemsSettings({ enabled: true })],
    formHeader: [
      { activeView: form },
      (c) => c.updateDatabaseFormHeaderSettings({ title: "Apply" } as never),
    ],
    formQuestion: [
      { activeView: form },
      (c) => c.updateDatabaseFormQuestionSettings("column-notes", { required: true } as never),
    ],
    formShare: [
      { activeView: form },
      (c) => c.updateDatabaseFormShareSettings({ enabled: true } as never),
    ],
    formHeaderOnTable: [{}, (c) => c.updateDatabaseFormHeaderSettings({ title: "x" } as never)],
    viewTitle: [{}, (c) => c.saveDatabaseViewTitle("Roadmap")],
    viewTitleUnchanged: [{}, (c) => c.saveDatabaseViewTitle("Table")],
  });
});

test("database and property intents", async (t) => {
  await capture(t, {
    addProperty: [{}, (c) => c.addDatabaseProperty("number", "Score", 1)],
    addPropertyDefault: [{}, (c) => c.addDatabaseProperty()],
    addPropertyReadOnly: [{ editable: false }, (c) => c.addDatabaseProperty("number")],
    renameProperty: [{}, (c) => c.renameDatabaseProperty("column-notes", "Details")],
    propertyConfig: [
      {},
      (c) => c.updateDatabasePropertyConfig("column-status", { options: [{ id: "a", name: "A" }] }),
    ],
    relationLimit: [
      { properties: [status, relation] },
      (c) =>
        c.updateDatabasePropertyConfig("column-related", {
          relation: { limit: "one_page" },
        } as never),
    ],
    databaseEmoji: [{}, (c) => c.saveDatabaseEmoji("y")],
    databaseTitle: [{}, (c) => c.saveDatabaseTitle("Roadmap")],
    databaseTitleUnchanged: [{}, (c) => c.saveDatabaseTitle("Tasks")],
    nameColumn: [{}, (c) => c.updateNameColumnConfig({ label: "Task" })],
  });
});

test("row intents", async (t) => {
  await capture(t, {
    addRowTable: [{}, (c) => c.addDatabaseRow()],
    addRowKanbanDefault: [{ activeView: kanban }, (c) => c.addDatabaseRow()],
    addRowKanbanGroup: [{ activeView: kanban }, (c) => c.addDatabaseRow("Done")],
    addRowMissingParent: [
      { activeView: view("table", { subItems: { enabled: true } }) },
      (c) => c.addDatabaseRow(undefined, null, "row-1"),
    ],
    addTimelineRow: [
      { activeView: timeline },
      (c) => c.addTimelineRow(new Date("2026-09-01T00:00:00Z"), new Date("2026-09-03T00:00:00Z")),
    ],
    addCalendarRow: [
      { activeView: calendar },
      (c) =>
        c.addCalendarRow({
          allDay: true,
          start: new Date(2026, 8, 1),
          end: new Date(2026, 8, 2),
        } as never),
    ],
    savePropertyValue: [
      {},
      (c) => c.savePropertyValue("row-1", "status", "status", "Todo", "Done"),
    ],
    savePropertyValueUnchanged: [
      {},
      (c) => c.savePropertyValue("row-1", "status", "status", "Done", "Done"),
    ],
  });
});
