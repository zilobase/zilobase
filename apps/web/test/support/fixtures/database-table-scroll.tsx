import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { DatabaseVirtualizedTable } from "../../../src/features/databases/views/table/components/database-table-shell";
import {
  DatabaseCellStateProvider,
  useSetActiveDatabaseCell,
} from "../../../src/features/databases/views/state/database-cell-state";
import type { TableRow } from "../../../src/features/databases/views/table/model/database-table-model";

export function mountScrollTable(container: HTMLElement, count: number) {
  const renders = new Map<number, number>();
  let keyReads = 0;
  let renderedRangeNotifications = 0;
  let rows = Array.from({ length: count }, (_, index) => ({
    get id() {
      keyReads++;
      return `row-${index}`;
    },
    pageId: `page-${index}`,
  })) as TableRow[];
  let setActive: (key: string | null) => void;
  function ActiveCellController() {
    setActive = useSetActiveDatabaseCell();
    return null;
  }
  const root = createRoot(container);
  function render(label: string) {
    flushSync(() =>
      root.render(
        createElement(
          DatabaseCellStateProvider,
          null,
          createElement(ActiveCellController),
          createElement(DatabaseVirtualizedTable, {
            columnKeys: ["name"],
            columnWidths: { name: 250 },
            measurementKey: "test",
            tableMinWidth: 250,
            virtualizationEnabled: true,
            onRowsRendered: () => {
              renderedRangeNotifications += 1;
            },
            rows,
            renderRow: (row, index, measureElement) => {
              renders.set(index, (renders.get(index) ?? 0) + 1);
              return createElement(
                "tr",
                { key: row.id, "data-index": index, ref: measureElement },
                createElement("td", null, `${label} ${row.pageId}`),
              );
            },
          }),
        ),
      ),
    );
  }
  render("Row");
  return {
    renders,
    reset: () => {
      renders.clear();
      keyReads = 0;
    },
    getKeyReads: () => keyReads,
    getRenderedRangeNotifications: () => renderedRangeNotifications,
    update: () => render("Updated"),
    reverse: () => {
      rows = [...rows].reverse();
      render("Reversed");
    },
    activate: (key: string | null) => flushSync(() => setActive(key)),
    unmount: () => flushSync(() => root.unmount()),
  };
}
