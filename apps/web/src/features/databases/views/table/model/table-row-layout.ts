import type { RowLayout } from "./database-table-model";

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
