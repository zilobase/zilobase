import { resetDatabaseRowDropOwner } from "./database-row-drop-owner"

const DATABASE_ROW_DRAGGING_CLASS = "database-row-dragging"

export type DatabaseRowDragOverlay = {
  height: number
  left: number
  offsetX: number
  offsetY: number
  title: string
  top: number
  width: number
}

export function hideNativeDatabaseRowDragPreview(dataTransfer: DataTransfer) {
  const dragImage = document.createElement("span")

  Object.assign(dragImage.style, {
    height: "1px",
    left: "-100px",
    opacity: "0",
    position: "fixed",
    top: "-100px",
    width: "1px",
  })

  document.body.appendChild(dragImage)
  dataTransfer.setDragImage(dragImage, 0, 0)
  window.requestAnimationFrame(() => dragImage.remove())
}

export function startDatabaseRowDrag() {
  document.getSelection()?.removeAllRanges()
  document.body.classList.add(DATABASE_ROW_DRAGGING_CLASS)
}

export function finishDatabaseRowDrag() {
  document.body.classList.remove(DATABASE_ROW_DRAGGING_CLASS)
  resetDatabaseRowDropOwner()
}
