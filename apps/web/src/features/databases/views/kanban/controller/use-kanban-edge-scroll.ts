import { useEffect, type RefObject } from "react";
import { hasDatabasePageDragPayload } from "../../../interactions/database-page-drop";
import { getKanbanEdgeScrollSpeed } from "../model/database-kanban-card-drag";

/** Keep scrolling even when the dragged card is held still at a board edge. */
export function useKanbanEdgeScroll(scrollRef: RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!enabled || !scroller) return;

    let frame: number | null = null;
    let previousTime: number | null = null;
    let pointer: { x: number; y: number } | null = null;

    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      previousTime = null;
      pointer = null;
    };
    const getSpeed = () => {
      if (!pointer) return 0;
      const rect = scroller.getBoundingClientRect();
      if (
        pointer.y < Math.max(0, rect.top) ||
        pointer.y > Math.min(window.innerHeight, rect.bottom)
      )
        return 0;
      return getKanbanEdgeScrollSpeed({
        clientX: pointer.x,
        left: Math.max(0, rect.left),
        right: Math.min(window.innerWidth, rect.right),
        scrollLeft: scroller.scrollLeft,
        maxScrollLeft: scroller.scrollWidth - scroller.clientWidth,
      });
    };
    const tick = (time: number) => {
      frame = null;
      const speed = getSpeed();
      if (!speed) {
        stop();
        return;
      }
      const elapsed = previousTime === null ? 16 : Math.min(time - previousTime, 32);
      previousTime = time;
      scroller.scrollLeft += (speed * elapsed) / 1000;
      frame = requestAnimationFrame(tick);
    };
    const dragOver = (event: DragEvent) => {
      if (!event.dataTransfer || !hasDatabasePageDragPayload(event.dataTransfer)) {
        stop();
        return;
      }
      pointer = { x: event.clientX, y: event.clientY };
      if (!getSpeed()) {
        stop();
        return;
      }
      if (frame === null) frame = requestAnimationFrame(tick);
    };
    const leaveWindow = (event: DragEvent) => {
      if (event.relatedTarget === null) stop();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") stop();
    };

    // Capture sees events even when a card or column stops propagation.
    document.addEventListener("dragover", dragOver, true);
    document.addEventListener("drop", stop, true);
    document.addEventListener("dragend", stop, true);
    document.addEventListener("dragleave", leaveWindow, true);
    document.addEventListener("keydown", keyDown, true);
    window.addEventListener("blur", stop);
    return () => {
      stop();
      document.removeEventListener("dragover", dragOver, true);
      document.removeEventListener("drop", stop, true);
      document.removeEventListener("dragend", stop, true);
      document.removeEventListener("dragleave", leaveWindow, true);
      document.removeEventListener("keydown", keyDown, true);
      window.removeEventListener("blur", stop);
    };
  }, [enabled, scrollRef]);
}
