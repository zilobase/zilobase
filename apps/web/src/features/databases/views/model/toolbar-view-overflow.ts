export function getVisibleToolbarViewCount({
  viewCount,
  tabWidths,
  availableWidth,
  overflowWidth,
  activeIndex,
  canAddView,
}: {
  viewCount: number;
  tabWidths: number[];
  availableWidth: number;
  overflowWidth: number;
  activeIndex: number;
  canAddView: boolean;
}) {
  const addViewSpace = canAddView ? 40 : 0;
  const tabsWidth = (indexes: number[]) =>
    8 +
    indexes.reduce((total, index) => total + (tabWidths[index] ?? 0), 0) +
    Math.max(0, indexes.length - 1) * 2;
  const allIndexes = Array.from({ length: viewCount }, (_, index) => index);
  if (tabsWidth(allIndexes) + addViewSpace <= availableWidth) return viewCount;
  const overflowSpace = overflowWidth + 8;
  let nextVisibleCount = Math.min(1, viewCount);
  for (let count = 1; count < viewCount; count += 1) {
    const indexes = Array.from({ length: count }, (_, index) => index);
    if (activeIndex >= count && indexes.length > 0) indexes[indexes.length - 1] = activeIndex;
    if (tabsWidth(indexes) + overflowSpace + addViewSpace <= availableWidth)
      nextVisibleCount = count;
    else break;
  }
  return nextVisibleCount;
}

export function partitionToolbarViews<T extends { id: string }>(
  views: T[],
  activeView: T | undefined,
  visibleCount: number,
) {
  const count = Math.min(visibleCount, views.length);
  const visibleIds = new Set(views.slice(0, count).map((view) => view.id));
  if (activeView && count > 0 && !visibleIds.has(activeView.id)) {
    visibleIds.delete(views[count - 1]!.id);
    visibleIds.add(activeView.id);
  }
  return {
    visibleViewTabs: views.filter((view) => visibleIds.has(view.id)),
    overflowViewTabs: views.filter((view) => !visibleIds.has(view.id)),
  };
}
