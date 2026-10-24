import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";

type Point = { x: number; y: number };
type Bounds = { left: number; right: number; top: number; bottom: number };

// Embedded editors can promote a record gesture to a block selection. The
// database retains pointer, marquee, and scrolling ownership until release.
export type DatabaseMarqueeGesture = {
  cancel: () => void;
  selectBlocks?: (bounds: Bounds) => boolean;
  endBlocks?: (restore: boolean) => void;
};

const RECORD_SELECTOR = "[data-database-row-id], [data-gantt-row-id]";
const WHITESPACE_SELECTOR = [
  ".database-table-scroll",
  ".database-table-scroll-content",
  ".database-row-controls",
  ".database-gallery-grid",
  ".database-gallery-groups",
  ".database-gallery-group",
  ".database-list-rows",
  ".database-kanban-board",
  ".database-kanban-cards",
  ".database-kanban-scroll",
  ".database-kanban-scroll-content",
].join(", ");

const INTERACTIVE_SELECTOR = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "label",
  "summary",
  "[role=button]",
  "[role=checkbox]",
  "[role=combobox]",
  "[role=textbox]",
  "[role=tab]",
  "[contenteditable=true]",
  "[draggable=true]",
  "th",
  "td",
  RECORD_SELECTOR,
].join(", ");

// Page chrome contains full-width wrappers around short labels. Test the text
// itself, so their unused padding behaves just like the surrounding page body.
function hitsText(target: HTMLElement, x: number, y: number) {
  const doc = target.ownerDocument;
  const walker = doc.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    range.selectNodeContents(node);
    if (
      [...range.getClientRects()].some(
        (rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom,
      )
    )
      return true;
  }
  return false;
}

// A single DOM controller serves the record renderers. Selection still belongs
// to useDatabaseSelection, so checkboxes and bulk commands use the same IDs.
export function useDatabaseMarquee({
  surfaceRef,
  enabled,
  scope,
  rowIds,
  selectedRowIds,
  setSelectedRowIds,
  onStart,
}: {
  surfaceRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  scope: string;
  rowIds: string[];
  selectedRowIds: Set<string>;
  setSelectedRowIds: Dispatch<SetStateAction<Set<string>>>;
  onStart?: () => void;
}) {
  const latest = useRef({ rowIds, selectedRowIds, onStart });
  latest.current = { rowIds, selectedRowIds, onStart };
  // Reordering, collapsing groups, or changing the visible record window ends
  // a gesture; ordinary selection rerenders do not recreate its controller.
  const shape = JSON.stringify(rowIds);
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !enabled) return;
    surface.dataset.databaseMarqueeSurface = "true";
    const previousTabIndex = surface.getAttribute("tabindex");
    if (previousTabIndex === null) surface.tabIndex = -1;
    const doc = surface.ownerDocument;
    const win = doc.defaultView!;
    const marquee = doc.createElement("div");
    marquee.className = "database-record-marquee";
    marquee.setAttribute("aria-hidden", "true");
    let frame: number | null = null;
    let clickTimer: number | undefined;
    let session: {
      pointerId: number;
      start: Point;
      pointer: Point;
      active: boolean;
      previous: Set<string>;
      measured: Map<string, Bounds>;
      last: Set<string>;
      origin: HTMLElement;
      gesture: DatabaseMarqueeGesture;
      blocks: boolean;
    } | null = null;

    const scrollParents = () => {
      const parents: HTMLElement[] = [];
      for (let node: HTMLElement | null = surface; node; node = node.parentElement) {
        if (
          /(auto|scroll)/.test(win.getComputedStyle(node).overflowY) &&
          node.scrollHeight > node.clientHeight
        )
          parents.push(node);
      }
      if (doc.scrollingElement && !parents.includes(doc.scrollingElement as HTMLElement))
        parents.push(doc.scrollingElement as HTMLElement);
      return parents;
    };
    // Horizontal scroll content can be clipped/sticky vertically. The record
    // surface follows the page scroll and keeps virtualized row Y coordinates stable.
    const contentOrigin = (element: HTMLElement) => ({
      left: element.getBoundingClientRect().left,
      top: surface.getBoundingClientRect().top,
    });
    const schedule = () => {
      if (session?.active && frame === null) frame = win.requestAnimationFrame(render);
    };
    const render = () => {
      frame = null;
      const current = session;
      if (!current?.active) return;
      const origin = contentOrigin(current.origin);
      const start = { x: origin.left + current.start.x, y: origin.top + current.start.y };
      const bounds = {
        left: Math.min(start.x, current.pointer.x),
        right: Math.max(start.x, current.pointer.x),
        top: Math.min(start.y, current.pointer.y),
        bottom: Math.max(start.y, current.pointer.y),
      };
      let clip = { left: 0, right: win.innerWidth, top: 0, bottom: win.innerHeight };
      for (const parent of scrollParents()) {
        if (parent === doc.scrollingElement) continue;
        const rect = parent.getBoundingClientRect();
        clip = {
          left: Math.max(clip.left, rect.left),
          right: Math.min(clip.right, rect.right),
          top: Math.max(clip.top, rect.top),
          bottom: Math.min(clip.bottom, rect.bottom),
        };
      }
      const left = Math.max(bounds.left, clip.left),
        top = Math.max(bounds.top, clip.top);
      Object.assign(marquee.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${Math.max(0, Math.min(bounds.right, clip.right) - left)}px`,
        height: `${Math.max(0, Math.min(bounds.bottom, clip.bottom) - top)}px`,
      });
      const blocks = current.gesture.selectBlocks?.(bounds) ?? false;
      if (session !== current) return;
      if (current.blocks && !blocks) focusDatabase();
      current.blocks = blocks;
      const valid = new Set(latest.current.rowIds);
      if (!surface.classList.contains("database-table-wrap")) current.measured.clear();
      const horizontalViewport =
        surface.querySelector<HTMLElement>(".database-inline-scroll") ?? surface;
      const visible = horizontalViewport.getBoundingClientRect();
      if (!blocks)
        surface.querySelectorAll<HTMLElement>(RECORD_SELECTOR).forEach((element) => {
          const id = element.dataset.databaseRowId ?? element.dataset.ganttRowId;
          if (!id || !valid.has(id) || !element.getClientRects().length) return;
          const rect = element.getBoundingClientRect();
          // Cache content coordinates so rows retain selection after virtualization
          // unmounts them during edge scrolling. Newly mounted rows join each frame.
          const previous = current.measured.get(id);
          const next = {
            left: Math.max(rect.left, visible.left) - origin.left,
            right: Math.min(rect.right, visible.right) - origin.left,
            top: rect.top - origin.top,
            bottom: rect.bottom - origin.top,
          };
          // Gantt renders the same record in both its sidebar and timeline.
          current.measured.set(
            id,
            previous && surface.classList.contains("database-timeline-view")
              ? {
                  left: Math.min(previous.left, next.left),
                  right: Math.max(previous.right, next.right),
                  top: next.top,
                  bottom: next.bottom,
                }
              : next,
          );
        });
      const next = new Set<string>();
      current.measured.forEach((rect, id) => {
        if (
          !blocks &&
          valid.has(id) &&
          rect.left < rect.right &&
          bounds.left < origin.left + rect.right &&
          bounds.right > origin.left + rect.left &&
          bounds.top < origin.top + rect.bottom &&
          bounds.bottom > origin.top + rect.top
        )
          next.add(id);
      });
      if (next.size !== current.last.size || [...next].some((id) => !current.last.has(id))) {
        current.last = next;
        setSelectedRowIds(next);
      }
      const scroll = scrollParents().find((parent) => {
        if (blocks && surface.contains(parent)) return false;
        const rect =
          parent === doc.scrollingElement
            ? { top: 0, bottom: win.innerHeight }
            : parent.getBoundingClientRect();
        const direction =
          current.pointer.y < rect.top + 40 ? -1 : current.pointer.y > rect.bottom - 40 ? 1 : 0;
        return direction < 0
          ? parent.scrollTop > 0
          : direction > 0 && parent.scrollTop < parent.scrollHeight - parent.clientHeight;
      });
      if (scroll) {
        const rect =
          scroll === doc.scrollingElement
            ? { top: 0, bottom: win.innerHeight }
            : scroll.getBoundingClientRect();
        const distance =
          current.pointer.y < rect.top + 40
            ? current.pointer.y - rect.top - 40
            : current.pointer.y - rect.bottom + 40;
        const before = scroll.scrollTop;
        scroll.scrollTop += Math.max(-18, Math.min(18, distance * 0.45));
        if (scroll.scrollTop !== before) schedule();
      }
    };
    const stop = (restore = false) => {
      const previous = session;
      session = null;
      if (frame !== null) win.cancelAnimationFrame(frame);
      frame = null;
      marquee.remove();
      surface.removeAttribute("data-marquee-selecting");
      doc.removeEventListener("pointermove", move, true);
      doc.removeEventListener("pointerup", up, true);
      doc.removeEventListener("pointercancel", cancel, true);
      doc.removeEventListener("keydown", key, true);
      doc.removeEventListener("scroll", schedule, true);
      win.removeEventListener("blur", cancel);
      previous?.gesture.endBlocks?.(restore);
      if (restore && previous?.active) setSelectedRowIds(previous.previous);
    };
    const focusDatabase = () => {
      const focusTarget =
        surface.querySelector<HTMLElement>('.database-table-scroll[role="grid"]') ?? surface;
      focusTarget.focus({ preventScroll: true });
    };
    const move = (event: PointerEvent) => {
      if (!session || event.pointerId !== session.pointerId) return;
      if (!(event.buttons & 1)) {
        stop();
        return;
      }
      session.pointer = { x: event.clientX, y: event.clientY };
      const origin = contentOrigin(session.origin);
      if (
        !session.active &&
        Math.hypot(
          event.clientX - origin.left - session.start.x,
          event.clientY - origin.top - session.start.y,
        ) >= 5
      ) {
        session.active = true;
        doc.body.append(marquee);
        surface.dataset.marqueeSelecting = "true";
        latest.current.onStart?.();
        // A gesture can begin in an editor's gutter. Move keyboard ownership
        // into the database so subsequent keys cannot edit the outer document.
        focusDatabase();
        doc.getSelection()?.removeAllRanges();
      }
      if (session.active) {
        event.preventDefault();
        schedule();
      }
    };
    const suppressClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const up = (event: PointerEvent) => {
      if (!session || event.pointerId !== session.pointerId) return;
      if (session.active) {
        session.pointer = { x: event.clientX, y: event.clientY };
        if (frame !== null) win.cancelAnimationFrame(frame);
        render();
        doc.addEventListener("click", suppressClick, true);
        clickTimer = win.setTimeout(() => doc.removeEventListener("click", suppressClick, true), 0);
      }
      stop();
    };
    const cancel = (event: Event) => {
      if (event instanceof win.PointerEvent && event.pointerId !== session?.pointerId) return;
      stop(true);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      stop(true);
    };
    const down = (event: PointerEvent) => {
      const target = event.target;
      if (
        session ||
        event.defaultPrevented ||
        event.button !== 0 ||
        !event.isPrimary ||
        event.pointerType !== "mouse" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !(target instanceof win.HTMLElement)
      )
        return;
      const startRegion = surface.closest<HTMLElement>("[data-database-selection-region]");
      if (startRegion) {
        if (!(startRegion.contains(target) || target.contains(startRegion))) return;
        const control = target.closest(INTERACTIVE_SELECTOR);
        if (control && startRegion.contains(control)) return;
        if (hitsText(target, event.clientX, event.clientY)) return;
      } else {
        // Embedded views share their page with the editor's block gesture.
        if (!(target.contains(surface) || surface.contains(target))) return;
        if (
          surface.contains(target) &&
          (target.closest(RECORD_SELECTOR) ||
            (target !== surface && !target.matches(WHITESPACE_SELECTOR)))
        )
          return;
      }
      const rect = (startRegion ?? surface).getBoundingClientRect();
      if (event.clientY < rect.top || event.clientY > rect.bottom) return;
      if (startRegion && (event.clientX < rect.left || event.clientX > rect.right)) return;
      const targetRect = target.getBoundingClientRect();
      const targetStyle = win.getComputedStyle(target);
      if (
        (/(auto|scroll)/.test(targetStyle.overflowY) &&
          target.offsetWidth > target.clientWidth &&
          event.clientX >= targetRect.left + target.clientWidth) ||
        (/(auto|scroll)/.test(targetStyle.overflowX) &&
          target.offsetHeight > target.clientHeight &&
          event.clientY >= targetRect.top + target.clientHeight)
      )
        return;
      // An ancestor gutter may span adjacent databases; choose the closest
      // record surface, including when starting below a standalone table.
      const candidates = [
        ...(startRegion ?? target).querySelectorAll<HTMLElement>("[data-database-marquee-surface]"),
      ].filter((element) => {
        const box = (
          element.closest<HTMLElement>("[data-database-selection-region]") ?? element
        ).getBoundingClientRect();
        return event.clientY >= box.top && event.clientY <= box.bottom;
      });
      const distance = (element: HTMLElement) => {
        const box = element.getBoundingClientRect();
        return Math.hypot(
          Math.max(box.left - event.clientX, event.clientX - box.right, 0),
          Math.max(box.top - event.clientY, event.clientY - box.bottom, 0),
        );
      };
      if (
        candidates.some((element) => element !== surface && distance(element) < distance(surface))
      )
        return;
      const origin =
        surface.querySelector<HTMLElement>(
          ".database-table-scroll-content, .database-kanban-scroll-content",
        ) ?? surface;
      const originRect = contentOrigin(origin);
      session = {
        pointerId: event.pointerId,
        start: { x: event.clientX - originRect.left, y: event.clientY - originRect.top },
        pointer: { x: event.clientX, y: event.clientY },
        active: false,
        previous: new Set(latest.current.selectedRowIds),
        measured: new Map(),
        last: new Set(latest.current.selectedRowIds),
        origin,
        gesture: { cancel: () => stop() },
        blocks: false,
      };
      surface.dispatchEvent(
        new CustomEvent<DatabaseMarqueeGesture>("database-marquee-start", {
          bubbles: true,
          detail: session.gesture,
        }),
      );
      event.preventDefault();
      doc.addEventListener("pointermove", move, true);
      doc.addEventListener("pointerup", up, true);
      doc.addEventListener("pointercancel", cancel, true);
      doc.addEventListener("keydown", key, true);
      doc.addEventListener("scroll", schedule, true);
      win.addEventListener("blur", cancel);
    };
    const editor = surface.closest(".tiptap-editor");
    const clearBlockRowSelection = (event: Event) => {
      if ((event as CustomEvent<boolean>).detail) {
        setSelectedRowIds((current) => (current.size ? new Set() : current));
      }
    };
    // Whole-block selection owns the editor, including databases other than the
    // one where a record marquee started. Other editor panes keep their rows.
    editor?.addEventListener("editor-block-selection-change", clearBlockRowSelection);
    doc.addEventListener("pointerdown", down, true);
    return () => {
      stop();
      delete surface.dataset.databaseMarqueeSurface;
      if (previousTabIndex === null) surface.removeAttribute("tabindex");
      doc.removeEventListener("pointerdown", down, true);
      editor?.removeEventListener("editor-block-selection-change", clearBlockRowSelection);
      doc.removeEventListener("click", suppressClick, true);
      if (clickTimer !== undefined) win.clearTimeout(clickTimer);
    };
  }, [surfaceRef, enabled, scope, shape, setSelectedRowIds]);
}
