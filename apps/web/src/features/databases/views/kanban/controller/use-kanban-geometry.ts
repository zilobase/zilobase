import { useCallback, useEffect, useRef, useState } from "react";
import { getKanbanCardDropTargetIndex } from "../model/database-kanban-card-drag";

type ColumnMeasurement = {
  cards: { height: number; top: number }[];
  gap: number;
  heights: number[];
  paddingTop: number;
};

/** Layout reads never use transformed drag-preview positions. */
export function useKanbanGeometry<
  Row extends { id: string },
  Option extends { id: string },
>(input: { allRows: Row[]; options: Option[]; getOptionItems: (option: Option) => Row[] }) {
  const inputRef = useRef(input);
  inputRef.current = input;
  const columns = useRef(new Map<string, HTMLElement>());
  const cards = useRef(new Map<string, Map<string, HTMLElement>>());
  const measurements = useRef(new Map<string, ColumnMeasurement>());
  const observedOptions = useRef(new WeakMap<Element, string>());
  const observerRef = useRef<ResizeObserver | null>(null);
  const columnCallbacks = useRef(new Map<string, (element: HTMLElement | null) => void>());
  const cardCallbacks = useRef(new Map<string, (element: HTMLElement | null) => void>());
  const pending = useRef(new Set<string>());
  const frame = useRef<number | null>(null);
  const [, setVersion] = useState(0);

  const measure = useCallback((optionId: string) => {
    const option = inputRef.current.options.find(({ id }) => id === optionId);
    const element = columns.current.get(optionId);
    if (!option || !element) {
      measurements.current.delete(optionId);
      return;
    }
    const geometry = inputRef.current.getOptionItems(option).flatMap((row) => {
      const card = cards.current.get(optionId)?.get(row.id);
      return card ? [{ height: card.offsetHeight, top: card.offsetTop }] : [];
    });
    const style = getComputedStyle(element);
    const next = {
      cards: geometry,
      gap: parseFloat(style.rowGap) || 0,
      heights: geometry.map(({ height }) => height),
      paddingTop: parseFloat(style.paddingTop) || 0,
    };
    const previous = measurements.current.get(optionId);
    if (
      previous &&
      previous.gap === next.gap &&
      previous.paddingTop === next.paddingTop &&
      previous.cards.length === next.cards.length &&
      previous.cards.every(
        (card, index) =>
          card.top === next.cards[index].top && card.height === next.cards[index].height,
      )
    )
      return;
    measurements.current.set(optionId, next);
    setVersion((version) => version + 1);
  }, []);

  const schedule = useCallback(
    (optionId: string) => {
      pending.current.add(optionId);
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const ids = [...pending.current];
        pending.current.clear();
        ids.forEach(measure);
      });
    },
    [measure],
  );

  const getColumnRef = useCallback(
    (optionId: string) => {
      const existing = columnCallbacks.current.get(optionId);
      if (existing) return existing;
      const callback = (element: HTMLElement | null) => {
        const previous = columns.current.get(optionId);
        if (previous === element) return;
        if (previous) observerRef.current?.unobserve(previous);
        if (element) {
          columns.current.set(optionId, element);
          observedOptions.current.set(element, optionId);
          observerRef.current?.observe(element);
        } else {
          columns.current.delete(optionId);
          measurements.current.delete(optionId);
          columnCallbacks.current.delete(optionId);
        }
        schedule(optionId);
      };
      columnCallbacks.current.set(optionId, callback);
      return callback;
    },
    [schedule],
  );

  const getCardRef = useCallback(
    (optionId: string, rowId: string) => {
      const key = `${optionId}\u0000${rowId}`;
      const existing = cardCallbacks.current.get(key);
      if (existing) return existing;
      const callback = (element: HTMLElement | null) => {
        let entries = cards.current.get(optionId);
        const previous = entries?.get(rowId);
        if (previous === element) return;
        if (previous) observerRef.current?.unobserve(previous);
        if (element) {
          if (!entries) cards.current.set(optionId, (entries = new Map()));
          entries.set(rowId, element);
          observedOptions.current.set(element, optionId);
          observerRef.current?.observe(element);
        } else {
          entries?.delete(rowId);
          if (!entries?.size) cards.current.delete(optionId);
          cardCallbacks.current.delete(key);
        }
        schedule(optionId);
      };
      cardCallbacks.current.set(key, callback);
      return callback;
    },
    [schedule],
  );

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      entries.forEach(({ target }) => {
        const id = observedOptions.current.get(target);
        if (id) schedule(id);
      });
    });
    observerRef.current = observer;
    columns.current.forEach((element) => observer.observe(element));
    cards.current.forEach((entries) => entries.forEach((element) => observer.observe(element)));
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [schedule]);
  useEffect(() => {
    input.options.forEach(({ id }) => schedule(id));
  }, [input.allRows, input.options, input.getOptionItems, schedule]);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      pending.current.clear();
    },
    [],
  );

  return {
    getColumnRef,
    getCardRef,
    getMeasurement: (optionId: string) => measurements.current.get(optionId),
    getTargetIndex: (optionId: string, clientY: number) => {
      // A second drag can start before the scheduled measurement of the first
      // drop. Read that column now instead of using the previous row positions.
      if (pending.current.delete(optionId)) measure(optionId);
      const element = columns.current.get(optionId);
      const measurement = measurements.current.get(optionId);
      if (!element || !measurement) return 0;
      return getKanbanCardDropTargetIndex(
        measurement.cards,
        clientY - element.getBoundingClientRect().top,
      );
    },
  };
}
