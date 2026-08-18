const NODE_VIEW_BLOCK_SELECTOR =
  ".database-block, .node-databaseBlock, .meeting-block, .node-meetingBlock"
const DATABASE_INLINE_SCROLL_SELECTOR = ".database-inline-scroll"

export function getDatabaseBlockDragImagePlacement(
  pointerX: number,
  pointerY: number,
  blockLeft: number,
  blockTop: number,
) {
  return {
    offsetX: Math.max(0, pointerX - blockLeft),
    offsetY: Math.max(0, pointerY - blockTop),
    paddingLeft: Math.max(0, blockLeft - pointerX),
  }
}

function lockDatabaseScrollClone(clone: HTMLElement, width: number) {
  clone
    .querySelectorAll<HTMLElement>(
      ".database-inline-scroll-wrap[data-inline-scroll='true']",
    )
    .forEach((element) => {
      element.style.setProperty("--database-inline-scroll-offset", "0px")
      element.style.setProperty(
        "--database-inline-scroll-viewport-width",
        `${width}px`,
      )
    })

  clone
    .querySelectorAll<HTMLElement>(DATABASE_INLINE_SCROLL_SELECTOR)
    .forEach((element) => {
      element.style.marginLeft = "0"
      element.style.width = `${width}px`
      element.style.maxWidth = `${width}px`
      element.style.overflow = "hidden"
    })

  clone
    .querySelectorAll<HTMLElement>(".database-inline-scroll-content")
    .forEach((element) => {
      element.style.paddingLeft = "0"
    })
}

export function setDatabaseBlockDragImage(event: DragEvent, image: Element) {
  if (!(image instanceof HTMLElement) || !event.dataTransfer) return false

  const block = image.closest<HTMLElement>(NODE_VIEW_BLOCK_SELECTOR) ?? image
  const rect = block.getBoundingClientRect()
  if (!rect.width || !rect.height) return false

  const placement = getDatabaseBlockDragImagePlacement(
    event.clientX,
    event.clientY,
    rect.left,
    rect.top,
  )
  const clone = block.cloneNode(true) as HTMLElement
  const scrollLefts = Array.from(
    block.querySelectorAll<HTMLElement>(DATABASE_INLINE_SCROLL_SELECTOR),
    (element) => element.scrollLeft,
  )
  const dragImage = document.createElement("div")

  dragImage.className = "tiptap-editor"
  Object.assign(dragImage.style, {
    height: `${rect.height}px`,
    left: "0",
    pointerEvents: "none",
    position: "fixed",
    top: "-10000px",
    width: `${rect.width + placement.paddingLeft}px`,
  })
  dragImage.style.setProperty("--database-inline-scroll-offset", "0px")
  dragImage.style.setProperty(
    "--database-inline-scroll-viewport-width",
    `${rect.width}px`,
  )

  Object.assign(clone.style, {
    margin: "0",
    marginLeft: `${placement.paddingLeft}px`,
    maxWidth: `${rect.width}px`,
    overflow: "hidden",
    width: `${rect.width}px`,
  })
  lockDatabaseScrollClone(clone, rect.width)

  dragImage.appendChild(clone)
  document.body.appendChild(dragImage)

  clone
    .querySelectorAll<HTMLElement>(DATABASE_INLINE_SCROLL_SELECTOR)
    .forEach((element, index) => {
      element.scrollLeft = scrollLefts[index] ?? 0
    })

  event.dataTransfer.setDragImage(
    dragImage,
    placement.offsetX,
    placement.offsetY,
  )
  window.requestAnimationFrame(() => dragImage.remove())
  return true
}
