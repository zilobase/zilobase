import type { EditorView } from "@tiptap/pm/view";
import { Selection } from "@tiptap/pm/state";
import type { BlockRange } from "../../extensions/lib/block-selection";
import type { DatabaseMarqueeGesture } from "@/sections/databases/views/shared/hooks/use-database-marquee";

type Point = { x: number; y: number };
type Bounds = { left: number; top: number; right: number; bottom: number };
type MarqueeOptions = {
  getRanges: () => BlockRange[];
  select: (range: BlockRange | null) => void;
  captureSelection: () => () => void;
};

const DRAG_THRESHOLD = 5;
const SCROLL_EDGE = 40;
const SCROLL_SPEED = 18;

export function getMarqueeBounds(start: Point, end: Point): Bounds {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  };
}

export function intersectsMarquee(a: Bounds, b: Bounds) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

// Owned by a ProseMirror view, including hosted editors. No React render or
// document mutation is needed for the marquee or its per-frame geometry.
export function createBlockMarquee(view: EditorView, options: MarqueeOptions) {
  let surface = view.dom;
  const ownerDocument = view.dom.ownerDocument;
  const ownerWindow = ownerDocument.defaultView!;
  const marquee = ownerDocument.createElement("div");
  marquee.className = "editor-block-marquee";
  marquee.setAttribute("aria-hidden", "true");
  let frame: number | null = null;
  let databaseGesture: { doc: typeof view.state.doc; gesture: DatabaseMarqueeGesture } | null =
    null;
  let session: {
    pointerId: number;
    start: Point;
    pointer: Point;
    active: boolean;
    doc: typeof view.state.doc;
    ranges: BlockRange[];
    restore: () => void;
    lastRange: string | undefined;
  } | null = null;

  const contentPoint = (point: Point): Point => {
    const rect = view.dom.getBoundingClientRect();
    return { x: point.x - rect.left, y: point.y - rect.top };
  };

  const intersectingRanges = (ranges: BlockRange[], bounds: Bounds) =>
    ranges.filter((range) => {
      const element = view.nodeDOM(range.from);
      return (
        element instanceof ownerWindow.HTMLElement &&
        element.getClientRects().length > 0 &&
        intersectsMarquee(bounds, element.getBoundingClientRect())
      );
    });

  const scrollParent = () => {
    for (let element = view.dom.parentElement; element; element = element.parentElement) {
      if (
        /(auto|scroll)/.test(ownerWindow.getComputedStyle(element).overflowY) &&
        element.scrollHeight > element.clientHeight
      ) {
        return element;
      }
    }
    return ownerDocument.scrollingElement as HTMLElement | null;
  };

  const schedule = () => {
    if (session?.active && frame === null) frame = ownerWindow.requestAnimationFrame(render);
  };

  const render = () => {
    frame = null;
    const current = session;
    if (!current?.active) return;

    const rect = view.dom.getBoundingClientRect();
    const start = { x: rect.left + current.start.x, y: rect.top + current.start.y };
    const bounds = getMarqueeBounds(start, current.pointer);
    const surfaceRect = surface.getBoundingClientRect();
    const left = Math.max(bounds.left, surfaceRect.left);
    const top = Math.max(bounds.top, surfaceRect.top);
    Object.assign(marquee.style, {
      left: `${left - surfaceRect.left + surface.scrollLeft}px`,
      top: `${top - surfaceRect.top + surface.scrollTop}px`,
      width: `${Math.max(0, Math.min(bounds.right, surfaceRect.right) - left)}px`,
      height: `${Math.max(0, Math.min(bounds.bottom, surfaceRect.bottom) - top)}px`,
    });

    const hits = intersectingRanges(current.ranges, bounds);
    const range = hits.length ? { from: hits[0].from, to: hits[hits.length - 1].to } : null;
    const rangeKey = range ? `${range.from}:${range.to}` : "none";
    if (rangeKey !== current.lastRange) {
      current.lastRange = rangeKey;
      options.select(range);
    }

    const scroll = scrollParent();
    if (!scroll) return;
    const viewport =
      scroll === ownerDocument.scrollingElement
        ? { top: 0, bottom: ownerWindow.innerHeight }
        : scroll.getBoundingClientRect();
    const velocity =
      current.pointer.y < viewport.top + SCROLL_EDGE
        ? -SCROLL_SPEED *
          Math.min(1, (viewport.top + SCROLL_EDGE - current.pointer.y) / SCROLL_EDGE)
        : current.pointer.y > viewport.bottom - SCROLL_EDGE
          ? SCROLL_SPEED *
            Math.min(1, (current.pointer.y - viewport.bottom + SCROLL_EDGE) / SCROLL_EDGE)
          : 0;
    const before = scroll.scrollTop;
    if (velocity) scroll.scrollTop += velocity;
    if (scroll.scrollTop !== before) schedule();
  };

  const stop = (restore = false) => {
    const previous = session;
    session = null;
    if (frame !== null) ownerWindow.cancelAnimationFrame(frame);
    frame = null;
    marquee.remove();
    surface.classList.remove("editor-marquee-selecting");
    ownerDocument.removeEventListener("pointermove", onMove, true);
    ownerDocument.removeEventListener("pointerup", onUp, true);
    ownerDocument.removeEventListener("pointercancel", onCancel, true);
    ownerDocument.removeEventListener("keydown", onKeyDown, true);
    ownerDocument.removeEventListener("scroll", schedule, true);
    ownerWindow.removeEventListener("blur", onCancel);
    if (restore && previous?.active && previous.doc === view.state.doc) previous.restore();
  };

  const onMove = (event: PointerEvent) => {
    if (!session || event.pointerId !== session.pointerId) return;
    if (!(event.buttons & 1)) {
      stop();
      return;
    }
    session.pointer = { x: event.clientX, y: event.clientY };
    const point = contentPoint(session.pointer);
    if (
      !session.active &&
      Math.hypot(point.x - session.start.x, point.y - session.start.y) >= DRAG_THRESHOLD
    ) {
      session.active = true;
      surface.append(marquee);
      surface.classList.add("editor-marquee-selecting");
      view.focus();
      ownerDocument.getSelection()?.removeAllRanges();
    }
    if (session.active) {
      event.preventDefault();
      schedule();
    }
  };

  const onUp = (event: PointerEvent) => {
    if (!session || event.pointerId !== session.pointerId) return;
    if (session.active) {
      session.pointer = { x: event.clientX, y: event.clientY };
      // Always include the release position, even before the next animation frame.
      if (frame !== null) ownerWindow.cancelAnimationFrame(frame);
      render();
    } else {
      const rect = view.dom.getBoundingClientRect();
      const position = view.posAtCoords({
        left: Math.max(rect.left + 1, Math.min(event.clientX, rect.right - 1)),
        top: event.clientY,
      });
      if (position) {
        view.dispatch(
          view.state.tr.setSelection(Selection.near(view.state.doc.resolve(position.pos))),
        );
        view.focus();
      }
    }
    stop();
  };
  const onCancel = () => stop(true);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    stop(true);
  };

  const onDown = (event: PointerEvent) => {
    // Tiptap creates the view before React mounts EditorContent. Resolve its
    // current surface at gesture time, also keeping nested editors independent.
    surface = view.dom.parentElement?.closest(".tiptap-editor")
      ? view.dom
      : (view.dom.closest<HTMLElement>("[data-editor-surface]") ?? view.dom);
    const target = event.target;
    if (
      session ||
      !view.editable ||
      event.button !== 0 ||
      !event.isPrimary ||
      event.pointerType !== "mouse" ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      !(target instanceof ownerWindow.HTMLElement) ||
      !surface.contains(target) ||
      (target !== view.dom && !target.contains(view.dom)) ||
      target.closest("[data-editor-surface]") !== view.dom.closest("[data-editor-surface]")
    )
      return;

    const rect = view.dom.getBoundingClientRect();
    if (event.clientY < rect.top || event.clientY > rect.bottom) return;
    // Database record gestures own their aligned gutters inside this editor.
    // Let their controller receive the pointer without starting an outer block drag.
    if (
      [...view.dom.querySelectorAll("[data-database-marquee-surface]")].some((element) => {
        const bounds = element.getBoundingClientRect();
        return event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      })
    )
      return;
    // Leave scrollbar drags to the browser, including scrollable surfaces.
    const targetRect = target.getBoundingClientRect();
    if (event.clientX >= targetRect.left + target.clientWidth) return;

    const pointer = { x: event.clientX, y: event.clientY };
    session = {
      pointerId: event.pointerId,
      start: contentPoint(pointer),
      pointer,
      active: false,
      doc: view.state.doc,
      ranges: options.getRanges(),
      restore: options.captureSelection(),
      lastRange: undefined,
    };
    // Suppress native text dragging and compatibility mouse events. A plain
    // whitespace click places a caret on release without entering block mode.
    event.preventDefault();
    ownerDocument.addEventListener("pointermove", onMove, true);
    ownerDocument.addEventListener("pointerup", onUp, true);
    ownerDocument.addEventListener("pointercancel", onCancel, true);
    ownerDocument.addEventListener("keydown", onKeyDown, true);
    ownerDocument.addEventListener("scroll", schedule, true);
    ownerWindow.addEventListener("blur", onCancel);
  };

  const onDatabaseInteraction = (event: Event) => {
    if (
      event.target instanceof ownerWindow.Element &&
      event.target.closest(".tiptap-editor") === view.dom &&
      event.target.closest("[data-database-marquee-surface]")
    ) {
      options.select(null);
    }
  };
  const onDatabaseStart = (event: Event) => {
    const target = event.target;
    if (
      session ||
      databaseGesture ||
      !view.editable ||
      !(target instanceof ownerWindow.HTMLElement) ||
      target.closest(".tiptap-editor") !== view.dom
    )
      return;
    const ranges = options.getRanges();
    const databaseRange = ranges.find((range) => {
      const element = view.nodeDOM(range.from);
      return element instanceof ownerWindow.HTMLElement && element.contains(target);
    });
    if (!databaseRange) return;

    const gesture = (event as CustomEvent<DatabaseMarqueeGesture>).detail;
    const doc = view.state.doc;
    const restore = options.captureSelection();
    let lastRange: string | undefined;
    let active = false;
    databaseGesture = { doc, gesture };
    gesture.selectBlocks = (bounds) => {
      if (databaseGesture?.gesture !== gesture) return false;
      const hits = intersectingRanges(ranges, bounds);
      const blocks = hits.some((range) => range !== databaseRange);
      if (blocks) {
        // Include the starting database as a whole, even when its rows occupy
        // a wider or narrower area than the neighboring page blocks.
        const from = Math.min(databaseRange.from, hits[0].from);
        const to = Math.max(databaseRange.to, hits[hits.length - 1].to);
        const key = `${from}:${to}`;
        if (!active) {
          view.dom.classList.add("editor-marquee-selecting");
          view.focus();
          ownerDocument.getSelection()?.removeAllRanges();
        }
        if (key !== lastRange) options.select({ from, to });
        lastRange = key;
      } else if (active) {
        options.select(null);
        view.dom.classList.remove("editor-marquee-selecting");
        lastRange = undefined;
      }
      active = blocks;
      return blocks;
    };
    gesture.endBlocks = (cancelled) => {
      if (databaseGesture?.gesture !== gesture) return;
      databaseGesture = null;
      view.dom.classList.remove("editor-marquee-selecting");
      if (cancelled && doc === view.state.doc) restore();
    };
  };
  view.dom.addEventListener("focusin", onDatabaseInteraction);
  view.dom.addEventListener("pointerdown", onDatabaseInteraction);
  view.dom.addEventListener("database-marquee-start", onDatabaseStart);
  ownerDocument.addEventListener("pointerdown", onDown, true);
  return {
    update() {
      if (session && (!view.editable || session.doc !== view.state.doc)) stop();
      if (databaseGesture && (!view.editable || databaseGesture.doc !== view.state.doc))
        databaseGesture.gesture.cancel();
    },
    destroy() {
      stop();
      databaseGesture?.gesture.cancel();
      view.dom.removeEventListener("focusin", onDatabaseInteraction);
      view.dom.removeEventListener("pointerdown", onDatabaseInteraction);
      view.dom.removeEventListener("database-marquee-start", onDatabaseStart);
      ownerDocument.removeEventListener("pointerdown", onDown, true);
    },
  };
}
