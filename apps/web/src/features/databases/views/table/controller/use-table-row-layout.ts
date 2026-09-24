import { areRowLayoutsEqual, measureTableRowLayout } from "../model/table-row-layout";
import { useCallback, useEffect, useRef, useState } from "react";

import { type RowLayout } from "../model/database-table-model";

import type { RefObject } from "react";

export function useTableRowLayout({
  tableWrapRef,
  tableScrollRef,
  isInlineTableScrollEnabled,
}: {
  tableWrapRef: RefObject<HTMLDivElement | null>;
  tableScrollRef: RefObject<HTMLDivElement | null>;
  isInlineTableScrollEnabled: boolean;
}) {
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
    };
  }, [scheduleMeasureRows]);
  return {
    rowLayout,
    rowLayoutRef,
    getRowLayoutElement,
    measureRows,
    scheduleMeasureRows,
  };
}
