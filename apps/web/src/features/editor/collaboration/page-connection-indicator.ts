export type PageConnectionIndicator = "connecting" | "connected";

const indicators = new Map<string, PageConnectionIndicator>();
const listeners = new Map<string, Set<() => void>>();

export function getPageConnectionIndicator(pageId: string) {
  return indicators.get(pageId) ?? null;
}

export function subscribePageConnectionIndicator(pageId: string, listener: () => void) {
  const pageListeners = listeners.get(pageId) ?? new Set<() => void>();
  pageListeners.add(listener);
  listeners.set(pageId, pageListeners);

  return () => {
    pageListeners.delete(listener);
    if (pageListeners.size === 0) listeners.delete(pageId);
  };
}

export function setPageConnectionIndicator(
  pageId: string,
  indicator: PageConnectionIndicator | null,
) {
  if (getPageConnectionIndicator(pageId) === indicator) return;
  if (indicator) indicators.set(pageId, indicator);
  else indicators.delete(pageId);
  listeners.get(pageId)?.forEach((listener) => listener());
}
