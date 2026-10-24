import type { RowLayout } from "../lib/database-table-model";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
export function measureTableRowLayout(
  layoutElement: Pick<HTMLElement, "getBoundingClientRect" | "querySelector">,
  rowElements: Array<Pick<HTMLTableRowElement, "getBoundingClientRect" | "dataset">>,
): RowLayout {
  const layoutRect = layoutElement.getBoundingClientRect();
  const centers: Record<string, number> = {};
  const dropTops: number[] = [];
  const heights: Record<string, number> = {};
  const rowIds: string[] = [];

  rowElements.forEach((rowElement, index) => {
    const rect = rowElement.getBoundingClientRect();
    const top = rect.top - layoutRect.top;
    const height = rect.height;
    const rowId = rowElement.dataset.databaseRowId;

    if (rowId) {
      centers[rowId] = top + height / 2;
      heights[rowId] = height;
      rowIds.push(rowId);
    }

    dropTops[index] = top;

    if (index === rowElements.length - 1) {
      dropTops[index + 1] = top + height;
    }
  });

  if (rowElements.length === 0) {
    const footerElement = layoutElement.querySelector<HTMLElement>(
      "[data-database-row-drop-footer]",
    );

    if (footerElement) {
      dropTops[0] = footerElement.getBoundingClientRect().top - layoutRect.top;
    }
  }

  const nextLayout = { centers, dropTops, heights, rowIds };
  return nextLayout;
}

export function areRowLayoutsEqual(left: RowLayout, right: RowLayout) {
  const leftCenterKeys = Object.keys(left.centers);
  const rightCenterKeys = Object.keys(right.centers);

  if (leftCenterKeys.length !== rightCenterKeys.length) {
    return false;
  }

  for (const key of leftCenterKeys) {
    if (left.centers[key] !== right.centers[key] || left.heights[key] !== right.heights[key]) {
      return false;
    }
  }

  if (left.dropTops.length !== right.dropTops.length) {
    return false;
  }

  if (
    left.rowIds.length !== right.rowIds.length ||
    left.rowIds.some((rowId, index) => rowId !== right.rowIds[index])
  ) {
    return false;
  }

  return left.dropTops.every((top, index) => top === right.dropTops[index]);
}

export function useTableRowLayout({
  tableWrapRef,
  tableScrollRef,
  isInlineTableScrollEnabled,
}: {
  tableWrapRef: RefObject<HTMLDivElement | null>;
  tableScrollRef: RefObject<HTMLDivElement | null>;
  isInlineTableScrollEnabled: boolean;
}) {
  const headerCheckboxRef = useRef<HTMLButtonElement | null>(null);
  const [rowLayout, setRowLayout] = useState<RowLayout>({
    centers: {},
    dropTops: [],
    heights: {},
    rowIds: [],
  });
  const rowLayoutRef = useRef(rowLayout);
  const measurementFrameRef = useRef<number | null>(null);
  rowLayoutRef.current = rowLayout;
  const getRowElements = useCallback(() => {
    return Array.from(
      tableWrapRef.current?.querySelectorAll<HTMLTableRowElement>(
        ".database-table tbody tr[data-database-row-id]",
      ) ?? [],
    );
  }, []);
  const getRowLayoutElement = useCallback(() => {
    const wrapperElement = tableWrapRef.current;

    if (!isInlineTableScrollEnabled) {
      return wrapperElement;
    }

    return (
      tableScrollRef.current?.querySelector<HTMLElement>(".database-table-scroll-content") ??
      wrapperElement
    );
  }, [isInlineTableScrollEnabled]);
  const measureRows = useCallback(() => {
    const layoutElement = getRowLayoutElement();

    if (!layoutElement) {
      const emptyLayout = { centers: {}, dropTops: [], heights: {}, rowIds: [] };
      rowLayoutRef.current = emptyLayout;
      return emptyLayout;
    }

    const wrapperRect = tableWrapRef.current?.getBoundingClientRect();
    const headerRect = tableWrapRef.current
      ?.querySelector<HTMLElement>(".database-table thead tr")
      ?.getBoundingClientRect();
    if (wrapperRect && headerRect && headerCheckboxRef.current) {
      headerCheckboxRef.current.style.top = `${headerRect.top + headerRect.height / 2 - wrapperRect.top}px`;
      headerCheckboxRef.current.style.marginLeft = `${headerRect.left - wrapperRect.left}px`;
    }
    const nextLayout = measureTableRowLayout(layoutElement, getRowElements());
    rowLayoutRef.current = nextLayout;

    setRowLayout((currentLayout) =>
      areRowLayoutsEqual(currentLayout, nextLayout) ? currentLayout : nextLayout,
    );

    return nextLayout;
  }, [getRowElements, getRowLayoutElement]);
  const scheduleMeasureRows = useCallback(() => {
    if (measurementFrameRef.current !== null) return;

    measurementFrameRef.current = window.requestAnimationFrame(() => {
      measurementFrameRef.current = null;
      measureRows();
    });
  }, [measureRows]);
  useEffect(() => {
    window.addEventListener("resize", scheduleMeasureRows);
    window.addEventListener("scroll", scheduleMeasureRows, true);
    const resizeObserver = new ResizeObserver(scheduleMeasureRows);
    const wrapperElement = tableWrapRef.current;

    if (wrapperElement) {
      resizeObserver.observe(wrapperElement);
    }

    return () => {
      if (measurementFrameRef.current !== null) {
        window.cancelAnimationFrame(measurementFrameRef.current);
        measurementFrameRef.current = null;
      }
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleMeasureRows);
      window.removeEventListener("scroll", scheduleMeasureRows, true);
    };
  }, [scheduleMeasureRows]);
  return {
    headerCheckboxRef,
    rowLayout,
    rowLayoutRef,
    getRowLayoutElement,
    measureRows,
    scheduleMeasureRows,
  };
}
