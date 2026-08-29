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

export function setMultiBlockDragImage(
  event: DragEvent,
  images: HTMLElement[],
) {
  if (!event.dataTransfer || images.length < 2) return false

  const visibleImages = images
    .map((image) => ({ image, rect: image.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 0 && rect.height > 0)
  if (visibleImages.length < 2) return false

  const firstRect = visibleImages[0].rect
  const width = Math.max(...visibleImages.map(({ rect }) => rect.width))
  const dragImage = document.createElement("div")

  dragImage.className =
    "tiptap-editor editor-multi-block-drag-image shadow-xl"
  Object.assign(dragImage.style, {
    background: "var(--zb-color-surface-background-canvas)",
    border: "1px solid var(--zb-color-border-stroke-default)",
    borderRadius: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    left: "0",
    maxHeight: "320px",
    minHeight: "0",
    overflow: "hidden",
    padding: "8px",
    pointerEvents: "none",
    position: "fixed",
    top: "-10000px",
    width: `${width + 16}px`,
  })

  visibleImages.forEach(({ image, rect }) => {
    const clone = image.cloneNode(true) as HTMLElement

    clone.classList.remove("editor-block-selection")
    Object.assign(clone.style, {
      margin: "0",
      maxWidth: `${width}px`,
      minHeight: `${rect.height}px`,
      width: `${width}px`,
    })
    dragImage.appendChild(clone)
  })

  document.body.appendChild(dragImage)
  event.dataTransfer.setDragImage(
    dragImage,
    Math.max(0, Math.min(width, event.clientX - firstRect.left + 8)),
    Math.max(0, event.clientY - firstRect.top + 8),
  )
  window.requestAnimationFrame(() => dragImage.remove())
  return true
}
