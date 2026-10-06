import {
  ManualRecordPlacementProvider,
  useManualRecordPlacement,
} from "../../../src/features/databases/views/state/manual-record-placement";
import { createElement } from "react";
import { useProjectedDatabaseRecords } from "../../../../../packages/features/src/databases/interactions/react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { TestQueryClient as QueryClient } from "../../../../../packages/features/src/data/testing";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  ZilobaseFeaturesProvider,
  type ZilobaseFeaturesConfig,
} from "../../../../../packages/features/src/shared/context";
import { DbProvider } from "../../../../../packages/features/src/databases/queries/session";
import { useRecordDrops } from "../../../src/features/databases/views/controller/use-record-drop";
import { useDatabaseKanbanCardDrag } from "../../../src/features/databases/views/kanban/controller/use-database-kanban-card-drag";
import { buildKanbanBoard } from "../../../src/features/databases/views/kanban/model/database-kanban-board";
import type {
  DatabaseRow,
  KanbanGroupOption,
} from "../../../src/features/databases/views/kanban/model/database-kanban-group-model";
import type { DatabasePropertyListItem } from "../../../src/features/databases/views/model/database-group-config";

export function mountRecordDrops(container: HTMLElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false, gcTime: Infinity },
      queries: { gcTime: Infinity },
    },
  });
  const requests: Array<{
    command: Record<string, unknown>;
    resolve: (version: number) => void;
    reject: (error: Error) => void;
  }> = [];
  const apiFetch: ZilobaseFeaturesConfig["apiFetch"] = (async (
    _path: string,
    init?: RequestInit,
  ) => {
    const { command, commandId } = JSON.parse(String(init?.body));
    return new Promise((resolve, reject) =>
      requests.push({
        command,
        reject,
        resolve: (version) =>
          resolve({
            commandId,
            result: {},
            sourceVersions: { source: version },
            event: {
              actorId: "user",
              areas: ["records"],
              changes: {},
              commandId,
              committedAt: "2026-09-28T00:00:00.000Z",
              databaseId: "host",
              dataSourceId: "source",
              eventId: commandId,
              protocolVersion: 2,
              type: "database.mutation",
              version,
            },
          }),
      }),
    );
  }) as ZilobaseFeaturesConfig["apiFetch"];
  const auth = {} as ZilobaseFeaturesConfig["auth"];
  const row = (id: string): DatabaseRow => ({
    id,
    pageId: id,
    page: { name: id },
    position: 0,
    createdAt: "",
    updatedAt: "",
  });
  let rows = [row("a"), row("b"), row("c")];
  let values: Record<string, string> = {
    "a:status": "Todo",
    "b:status": "Done",
    "c:status": "Done",
  };
  let version: number | null = 1;
  let sorted = false;
  const property = {
    id: "status",
    property: { id: "status", type: "status" },
  } as DatabasePropertyListItem;
  let moves!: ReturnType<typeof useRecordDrops> & {
    rows: DatabaseRow[];
    visibleRows: DatabaseRow[];
    propertyValuesByKey: Record<string, string>;
  };
  let drag!: ReturnType<typeof useDatabaseKanbanCardDrag<DatabaseRow, KanbanGroupOption>>;
  let options: KanbanGroupOption[] = [];
  let columns = new Map<string, DatabaseRow[]>();

  let manual!: ReturnType<typeof useManualRecordPlacement>;
  function Capture() {
    manual = useManualRecordPlacement();
    const records = rows.map((row) => ({
      ...row,
      dataSourceId: "source",
      orderKey: "1024.0000000000",
      parentRowId: null,
      page: {
        ...row.page,
        id: row.pageId,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
        hasContent: false,
        metadata: null,
      },
      valuesByPropertyId: {
        status: {
          id: row.id + "-status",
          pageId: row.pageId,
          propertyId: "status",
          value: values[row.pageId + ":status"],
          createdAt: "",
          updatedAt: "",
        },
      },
    }));
    queryClient.setQueryData(["db", "kanban-test", "host", "window", "source", "all", false], {
      pages: [{ records, dataSourceVersion: version ?? 1 }],
    });
    const projected = useProjectedDatabaseRecords({
      records,
      dataSourceId: "source",
      sourceVersion: version,
    });
    const actions = useRecordDrops({ databaseId: "source", hostDatabaseId: "host" });
    const projectedRows = projected.map((record, position) => ({ ...record, position }));
    moves = {
      ...actions,
      rows: projectedRows,
      visibleRows: projectedRows,
      propertyValuesByKey: Object.fromEntries(
        projected.map((record) => [
          record.pageId + ":status",
          record.valuesByPropertyId.status?.value as string,
        ]),
      ),
    };
    const board = buildKanbanBoard({
      groupProperty: property,
      items: moves.visibleRows,
      propertyValuesByKey: moves.propertyValuesByKey,
      options: [
        { id: "Todo", name: "Todo" },
        { id: "Done", name: "Done" },
      ],
      personOptionsById: new Map(),
      temporaryKanbanOptions: [],
    });
    options = board.options;
    columns = board.rowsByGroupValue;
    drag = useDatabaseKanbanCardDrag({
      databaseId: "source",
      allRows: moves.rows,
      hostDatabaseId: "host",
      editable: true,
      groupProperty: property,
      options,
      propertyValuesByKey: moves.propertyValuesByKey,
      getOptionItems: (option) => columns.get(option.groupValue) ?? [],
      submitMove: moves.submitMove,
      addDraggedPageRow: async () => undefined,
    });
    return createElement(
      "div",
      null,
      options.map((option) =>
        createElement(
          "section",
          {
            key: option.id,
            ref: drag.getColumnRef(option.id),
            "data-column": option.groupValue,
            onDragOver: (event) => drag.dragOver(option, event),
            onDrop: (event) => drag.drop(option, event),
          },
          (columns.get(option.groupValue) ?? []).map((row) =>
            createElement(
              "article",
              {
                key: row.id,
                ref: drag.getCardRef(option.id, row.id),
                "data-row": row.id,
                draggable: true,
                onDragStart: (event) => drag.startDrag(row, option, event),
                onDragEnd: () => drag.clearDrag(),
              },
              row.id,
            ),
          ),
        ),
      ),
    );
  }
  const root = createRoot(container);
  const render = () =>
    flushSync(() =>
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            ZilobaseFeaturesProvider,
            { value: { queryClient, apiFetch, auth } },
            createElement(
              DbProvider,
              { queryClient, apiFetch, sessionId: "kanban-test" },
              createElement(ManualRecordPlacementProvider, {
                editable: true,
                sorted,
                viewId: "view-1",
                children: createElement(Capture),
              }),
            ),
          ),
        ),
      ),
    );
  render();
  return {
    requests,
    read: () => ({
      order: moves.rows.map(({ id }) => id),
      values: moves.propertyValuesByKey,
      pending: moves.isPending,
    }),
    drag: (rowId: string, source: string, target: string, index: number) => {
      const sourceOption = options.find(({ groupValue }) => groupValue === source)!;
      const targetOption = options.find(({ groupValue }) => groupValue === target)!;
      const card = container.querySelector(
        '[data-column="' + source + '"] [data-row="' + rowId + '"]',
      ) as HTMLElement;
      const event = {
        target: card,
        currentTarget: card,
        clientX: 10,
        clientY: index * 48,
        preventDefault() {},
        stopPropagation() {},
        dataTransfer: { setDragImage() {}, setData() {}, effectAllowed: "move" },
      };
      // Start and drop in the same frame exercises the synchronous active-card ref.
      flushSync(() =>
        drag.startDrag(
          moves.rows.find(({ id }) => id === rowId)!,
          sourceOption,
          event as never,
        ),
      );
      flushSync(() => drag.drop(targetOption, event as never));
    },
    refresh: (order: string[], nextValues: Record<string, string>, nextVersion: number | null) => {
      rows = order.map(row);
      values = nextValues;
      version = nextVersion;
      render();
    },
    setSorted: () => {
      sorted = true;
      render();
    },
    confirm: () => manual.confirm(),
    hasSortConfirmation: () => manual.pending,
    unmount: () => {
      flushSync(() => root.unmount());
      queryClient.clear();
    },
  };
}
