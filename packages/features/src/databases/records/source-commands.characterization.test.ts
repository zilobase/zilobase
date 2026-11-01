import test, { type TestContext } from "node:test";

import { createMutationTestRuntime } from "../../shared/mutation-runtime.test";
import type { ApiFetcher } from "../../shared/api-fetcher";
import { useZilobaseFeatures } from "../../shared/context";
import type {
  DatabaseBootstrapResponse,
  DatabaseCommandRequest,
  DatabaseViewEntity,
  DataSourceEntity,
} from "../core/entities";
import { createTestDatabasePayload, setTestDatabaseClientState } from "../mutations/test-helpers";
import { createDatabaseSourceCommands, type DatabaseSetupSelection } from "./source-commands";

/*
 * Characterizes data source and view-tab intents, including the multi-step
 * setup workflow, so the planner refactor can prove identical behavior.
 */

type Commands = ReturnType<typeof createDatabaseSourceCommands>;
type Call = { op: string; optimistic?: true; input: unknown };

const now = "2026-09-08T00:00:00.000Z";
const view = (id: string, dataSourceId: string, type = "table"): DatabaseViewEntity => ({
  config: { icon: "a" },
  createdAt: now,
  databaseId: "host",
  dataSourceId,
  id,
  name: id,
  position: 0,
  type,
  updatedAt: now,
});
const source = (id: string, parentDatabaseId: string): DataSourceEntity => ({
  config: { setupDismissed: false },
  configVersion: 1,
  createdAt: now,
  id,
  linkedAt: now,
  name: id,
  parentDatabaseId,
  position: 0,
  updatedAt: now,
  version: 1,
  workspaceId: "org",
});
const bootstrap = {
  database: { id: "host" },
  dataSources: [source("own", "host"), source("linked", "other")],
  properties: [],
  views: [view("view-own", "own"), view("view-linked", "linked", "kanban")],
} as unknown as DatabaseBootstrapResponse;

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortKeys(item)]),
  );
}

function setup(options: { editable?: boolean; failOn?: string } = {}) {
  const calls: Call[] = [];
  const record =
    (op: string, result: (input: Record<string, unknown>) => unknown) => async (raw: unknown) => {
      const { onOptimistic, ...input } = (raw ?? {}) as Record<string, unknown> & {
        onOptimistic?: (value: unknown) => void;
      };
      calls.push({ op, ...(onOptimistic ? { optimistic: true as const } : {}), input });
      if (options.failOn === op) throw new Error(`${op} failed`);
      const value = result(input);
      onOptimistic?.(value);
      await Promise.resolve();
      return value;
    };
  const linked = { dataSource: source("linked", "other"), view: view("view-new", "linked") };
  const commands: Record<string, (raw: unknown) => Promise<unknown>> = {
    updateDatabase: record("updateDatabase", () => source("own", "host")),
    applyDataSourceTemplate: record("applyDataSourceTemplate", () => ({})),
    createDataSource: record("createDataSource", () => linked),
    updateDatabaseView: record("updateDatabaseView", () => view("view-own", "own")),
    addDatabaseView: record("addDatabaseView", () => view("view-copy", "own")),
    linkDatabaseDataSource: record("linkDatabaseDataSource", () => linked),
    replaceDatabaseViewDataSource: record("replaceDatabaseViewDataSource", () =>
      view("view-own", "linked"),
    ),
    unlinkDatabaseDataSource: record("unlinkDatabaseDataSource", () => source("linked", "other")),
    deleteDatabaseView: record("deleteDatabaseView", () => ({ viewId: "x" })),
  };
  const selected: Array<string | null> = [];
  const messages: string[] = [];
  return { calls, commands, selected, messages, options };
}

type SourceInput = Parameters<typeof createDatabaseSourceCommands>[0];

function create(harness: ReturnType<typeof setup>, context: unknown) {
  return createDatabaseSourceCommands({
    context: context as never,
    databaseId: "host",
    editable: harness.options.editable ?? true,
    bootstrap,
    resolvedActiveViewId: "view-own",
    activeViewTabId: "view-own",
    viewTabs: [{ id: "view-own" }, { id: "view-linked" }],
    ...harness.commands,
    onViewSelected: (id: string | null) => harness.selected.push(id),
    notify: {
      error: (message: string) => harness.messages.push(`error: ${message}`),
      success: (message: string) => harness.messages.push(`success: ${message}`),
    },
    createSampleRowContent: (markdown: string) => ({ type: "doc", markdown }),
  } as unknown as SourceInput);
}

async function settle() {
  for (let index = 0; index < 10; index += 1) await new Promise((resolve) => setTimeout(resolve));
}

async function capture(
  t: TestContext,
  scenarios: Record<
    string,
    | [Parameters<typeof setup>[0], (commands: Commands) => unknown]
    | [(commands: Commands) => unknown]
  >,
) {
  const results: Record<string, unknown> = {};
  for (const [name, scenario] of Object.entries(scenarios)) {
    const [options, invoke] = scenario.length === 2 ? scenario : [{}, scenario[0]];
    const harness = setup(options);
    const returned = invoke(create(harness, {}));
    await settle();
    if (returned instanceof Promise) await returned.catch(() => undefined);
    results[name] = sortKeys({
      calls: harness.calls,
      messages: harness.messages,
      selected: harness.selected,
    });
  }
  t.assert.snapshot(results);
}

const sourceView = {
  dataSourceId: "linked",
  dataSourceName: "Linked",
  parentDatabaseId: "other",
  viewConfig: { groupPropertyId: "status" },
  viewId: "view-linked",
  viewName: "Board",
  viewType: "kanban",
};

test("data source intents", async (t) => {
  await capture(t, {
    link: [(c) => c.linkDataSourceView(sourceView)],
    unlinkLinked: [(c) => c.unlinkDataSource("linked")],
    unlinkOwnIgnored: [(c) => c.unlinkDataSource("own")],
    unlinkReadOnly: [{ editable: false }, (c) => c.unlinkDataSource("linked")],
    unlinkFails: [{ failOn: "unlinkDatabaseDataSource" }, (c) => c.unlinkDataSource("linked")],
    replace: [(c) => c.replaceActiveViewSource(sourceView)],
    addView: [(c) => c.addDataSourceView("linked", "kanban", "Board")],
    addViewReplace: [(c) => c.addDataSourceView("linked", "kanban", "Board", "replace")],
    addViewFails: [
      { failOn: "linkDatabaseDataSource" },
      (c) => c.addDataSourceView("linked", "list", "List"),
    ],
  });
});

test("view tab intents", async (t) => {
  await capture(t, {
    icon: [(c) => c.saveDatabaseViewIcon({ id: "view-own" }, "b")],
    iconMissing: [(c) => c.saveDatabaseViewIcon({ id: "missing" }, "b")],
    duplicate: [(c) => c.duplicateDatabaseView({ id: "view-linked" })],
    deleteActive: [(c) => c.deleteDatabaseViewByTab({ id: "view-own" })],
    deleteOther: [(c) => c.deleteDatabaseViewByTab({ id: "view-linked" })],
  });
});

function commandApi(sent: Array<{ path: string; command: unknown }>): ApiFetcher {
  return async <T>(path: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as DatabaseCommandRequest;
    sent.push({ path, command: request.command });
    const type = request.command.type;
    const created = source("created", "database-1");
    return {
      commandId: request.commandId,
      event: {
        actorId: "user-1",
        areas: ["dataSources"],
        changes: {},
        commandId: request.commandId,
        committedAt: now,
        databaseId: "database-1",
        dataSourceId: path.includes("/data-sources/") ? "created" : null,
        eventId: `event-${sent.length}`,
        protocolVersion: 2,
        type: "database.mutation",
        version: sent.length,
      },
      result:
        type === "dataSource.create" || type === "dataSource.link"
          ? { dataSource: created, view: { ...view("view-created", "created") } }
          : { dataSource: created },
      sourceVersions: path.includes("/data-sources/") ? { created: sent.length } : {},
    } as T;
  };
}

async function setupThrough(selection: DatabaseSetupSelection) {
  const sent: Array<{ path: string; command: unknown }> = [];
  const runtime = createMutationTestRuntime(useZilobaseFeatures, commandApi(sent));
  setTestDatabaseClientState(runtime.queryClient, createTestDatabasePayload());
  const harness = setup();
  const commands = createDatabaseSourceCommands({
    context: runtime.mutation,
    databaseId: "database-1",
    editable: true,
    bootstrap,
    resolvedActiveViewId: null,
    activeViewTabId: null,
    viewTabs: [],
    ...harness.commands,
    onViewSelected: (id: string | null) => harness.selected.push(id),
    notify: {
      error: (message: string) => harness.messages.push(`error: ${message}`),
      success: (message: string) => harness.messages.push(`success: ${message}`),
    },
    createSampleRowContent: (markdown: string) => ({ type: "doc", markdown }),
  } as unknown as SourceInput);
  try {
    await commands.handleDataSourceSetupSelection(selection);
    return sortKeys({ commands: sent, messages: harness.messages, selected: harness.selected });
  } finally {
    runtime.queryClient.clear();
  }
}

test("data source setup workflow", async (t) => {
  t.assert.snapshot({
    blank: await setupThrough({ databaseName: "Inbox" }),
    template: await setupThrough({ templateId: "tasks-tracker" }),
    csv: await setupThrough({
      csvImport: { headers: ["Name", "Owner"], name: "People", rows: [["Ada", "A"], [""]] },
    }),
    linkExisting: await setupThrough({ sourceView }),
  });
});
