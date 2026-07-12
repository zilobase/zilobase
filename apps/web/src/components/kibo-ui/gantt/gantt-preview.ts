import type { GanttSelection } from "./gantt-geometry"

type PreviewElement = Pick<HTMLElement, "dataset" | "style">

export function shouldPositionGanttPreviewOnFocus(
  element: Pick<HTMLElement, "matches">,
) {
  return element.matches(":focus-visible")
}

export function showGanttPreview(
  element: PreviewElement,
  selection: GanttSelection,
) {
  element.style.setProperty("--gantt-add-left", `${selection.left}px`)
  element.style.setProperty("--gantt-add-width", `${selection.width}px`)
  element.style.setProperty("--gantt-add-opacity", "1")
  element.dataset.previewVisible = "true"
}

export function hideGanttPreview(element: PreviewElement) {
  element.style.setProperty("--gantt-add-opacity", "0")
  element.dataset.previewVisible = "false"
}
