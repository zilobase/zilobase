export const findScrollLockElement = (element: HTMLElement | null) => {
  let current = element?.parentElement ?? null

  while (current) {
    const styles = window.getComputedStyle(current)
    const canScrollY =
      /(auto|scroll|overlay)/.test(styles.overflowY) &&
      current.scrollHeight > current.clientHeight

    if (canScrollY) return current
    current = current.parentElement
  }

  const scrollingElement = document.scrollingElement
  return scrollingElement instanceof HTMLElement
    ? scrollingElement
    : document.documentElement
}

export const isMobileViewport = () =>
  window.matchMedia("(max-width: 767px)").matches