import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

// Adapted from calendarcn's use-horizontal-scroll and use-vertical-scroll hooks.
// Source revision and MIT license are recorded in THIRD_PARTY_NOTICES.md.
const SCROLL_END_DEBOUNCE_MS = 150;
export const CALENDAR_SNAP_ANIMATION_MS = 200;

type CalendarWheelScrollOptions = {
  containerRef: RefObject<HTMLDivElement | null>;
  itemSize: number;
  axis: "horizontal" | "vertical";
  onNavigate: (itemsDelta: number) => void;
  clampOffset?: (offset: number) => number;
  disabled?: boolean;
};

type CalendarWheelScroll = {
  scrollOffset: number;
  slideOffset: number;
  isScrolling: boolean;
  isAnimating: boolean;
  triggerSlideAnimation: (itemsDelta: number) => void;
};

/**
 * Accumulate one dominant wheel axis, then settle exactly once onto the nearest
 * calendar row/column. The visual movement is applied by the caller as a CSS
 * transform so vertical timeline scrolling remains native and independent.
 */
export function useCalendarWheelScroll({
  containerRef,
  itemSize,
  axis,
  onNavigate,
  clampOffset = value => value,
  disabled,
}: CalendarWheelScrollOptions): CalendarWheelScroll {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [slideOffset, setSlideOffset] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedDelta = useRef(0);
  const onNavigateRef = useRef(onNavigate);
  const clampOffsetRef = useRef(clampOffset);
  const itemSizeRef = useRef(itemSize);
  useEffect(() => { onNavigateRef.current = onNavigate; }, [onNavigate]);
  useEffect(() => { clampOffsetRef.current = clampOffset; }, [clampOffset]);
  useEffect(() => { itemSizeRef.current = itemSize; }, [itemSize]);
  useEffect(() => () => {
    if (animationTimer.current) clearTimeout(animationTimer.current);
  }, []);

  const finishAnimation = useCallback((commit?: () => void) => {
    if (animationTimer.current) clearTimeout(animationTimer.current);
    animationTimer.current = setTimeout(() => {
      commit?.();
      setScrollOffset(0);
      setIsAnimating(false);
      setIsScrolling(false);
      accumulatedDelta.current = 0;
      animationTimer.current = null;
    }, CALENDAR_SNAP_ANIMATION_MS);
  }, []);

  const snapAndNavigate = useCallback((offset: number) => {
    const size = itemSizeRef.current;
    if (size <= 0) return;
    const itemsDelta = Math.round(offset / size);

    setIsAnimating(true);
    if (itemsDelta === 0) {
      setScrollOffset(0);
      finishAnimation();
      return;
    }

    setScrollOffset(itemsDelta * size);
    finishAnimation(() => onNavigateRef.current(-itemsDelta));
  }, [finishAnimation]);

  const triggerSlideAnimation = useCallback((itemsDelta: number) => {
    if (itemSize <= 0 || isAnimating || isScrolling || itemsDelta === 0) return;
    setSlideOffset(itemsDelta * itemSize);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setIsAnimating(true);
      setSlideOffset(0);
      if (animationTimer.current) clearTimeout(animationTimer.current);
      animationTimer.current = setTimeout(() => {
        setIsAnimating(false);
        animationTimer.current = null;
      }, CALENDAR_SNAP_ANIMATION_MS);
    }));
  }, [isAnimating, isScrolling, itemSize]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      if (disabled) return;
      const primary = axis === "horizontal" ? event.deltaX : event.deltaY;
      const cross = axis === "horizontal" ? event.deltaY : event.deltaX;
      if (Math.abs(primary) <= Math.abs(cross)) return;

      event.preventDefault();
      setIsScrolling(true);
      accumulatedDelta.current = clampOffsetRef.current(accumulatedDelta.current - primary);
      setScrollOffset(accumulatedDelta.current);

      if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
      scrollEndTimer.current = setTimeout(() => {
        scrollEndTimer.current = null;
        snapAndNavigate(accumulatedDelta.current);
      }, SCROLL_END_DEBOUNCE_MS);
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
      if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    };
  }, [axis, containerRef, disabled, snapAndNavigate]);

  return { scrollOffset, slideOffset, isScrolling, isAnimating, triggerSlideAnimation };
}
