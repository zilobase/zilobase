export function isNearScrollEnd(origin: HTMLElement, threshold = 96) {
  const scrollContainer = findScrollContainer(origin)

  if (scrollContainer) {
    return scrollContainer.scrollHeight
      - scrollContainer.scrollTop
      - scrollContainer.clientHeight <= threshold
  }

  const scrollingElement = document.scrollingElement
  if (!scrollingElement) return true
  return scrollingElement.scrollHeight
    - window.scrollY
    - window.innerHeight <= threshold
}

function findScrollContainer(origin: HTMLElement) {
  let element = origin.parentElement

  while (element) {
    const overflowY = window.getComputedStyle(element).overflowY
    if (
      (overflowY === "auto" || overflowY === "scroll")
      && element.scrollHeight > element.clientHeight
    ) {
      return element
    }
    element = element.parentElement
  }

  return null
}
