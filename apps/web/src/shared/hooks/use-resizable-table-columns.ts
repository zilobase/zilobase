import { useMemo, useState, type PointerEvent, type RefObject } from "react";

export function useResizableTableColumns({
  columnKeys,
  getDefaultWidth,
  minWidth,
  tableWrapRef,
}: {
  columnKeys: string[];
  getDefaultWidth: (columnKey: string) => number;
  minWidth: number;
  tableWrapRef: RefObject<HTMLElement | null>;
}) {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const getColumnWidth = (columnKey: string) =>
    columnWidths[columnKey] ?? getDefaultWidth(columnKey);
  const tableMinWidth = useMemo(
    () =>
      columnKeys.reduce(
        (width, columnKey) => width + getColumnWidth(columnKey),
        0,
      ),
    [columnKeys, columnWidths],
  );

  const startColumnResize = (
    columnKey: string,
    event: PointerEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = getColumnWidth(columnKey);
    let nextWidth = startWidth;
    let animationFrame: number | null = null;

    const applyWidth = () => {
      animationFrame = null;
      const wrapper = tableWrapRef.current;

      wrapper
        ?.querySelectorAll<HTMLTableColElement>("col[data-column-id]")
        .forEach((column) => {
          if (column.dataset.columnId === columnKey) {
            column.style.width = `${nextWidth}px`;
          }
        });

      wrapper
        ?.querySelectorAll<HTMLElement>(".database-table")
        .forEach((table) => {
          table.style.setProperty(
            "--database-table-min-width",
            `${tableMinWidth + nextWidth - startWidth}px`,
          );
        });
    };

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      nextWidth = Math.max(minWidth, startWidth + moveEvent.clientX - startX);

      if (animationFrame === null) {
        animationFrame = requestAnimationFrame(applyWidth);
      }
    };

    const removeListeners = () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
        applyWidth();
      }

      setColumnWidths((widths) => ({ ...widths, [columnKey]: nextWidth }));
      document.body.classList.remove("database-resize-cursor");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", removeListeners);
      window.removeEventListener("pointercancel", removeListeners);
    };

    document.body.classList.add("database-resize-cursor");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", removeListeners);
    window.addEventListener("pointercancel", removeListeners);
  };

  return {
    columnWidths,
    getColumnWidth,
    startColumnResize,
    tableMinWidth,
  };
}
