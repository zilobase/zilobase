export const RIGHT_SIDEBAR_SINGLE_MAX_SIZE = 100 / 3
export const RIGHT_SIDEBAR_SPLIT_MAX_SIZE = 25
export const RIGHT_SIDEBAR_SINGLE_DEFAULT_SIZE = 28
export const RIGHT_SIDEBAR_SPLIT_DEFAULT_SIZE = 25
export const RIGHT_SIDEBAR_INNER_SPLIT_SIZE = 50
export const RIGHT_SIDEBAR_TRANSITION_MS = 320
export const APP_SIDEBAR_PANEL_WIDTH = "288px"

const RIGHT_SIDEBAR_MIN_SIZE = 18

function percentage(size: number) {
  return `${size}%`
}

export function getRightSidebarEditorDefaultSize(openPanelCount: number) {
  if (openPanelCount >= 2) {
    return percentage(100 - RIGHT_SIDEBAR_SPLIT_DEFAULT_SIZE * 2)
  }

  if (openPanelCount === 1) {
    return percentage(100 - RIGHT_SIDEBAR_SINGLE_DEFAULT_SIZE)
  }

  return "100%"
}

export function getRightSidebarDockMinSize(
  splitDock: boolean,
  navigationSidebarOpen: boolean,
) {
  if (splitDock) return RIGHT_SIDEBAR_INNER_SPLIT_SIZE
  return navigationSidebarOpen
    ? RIGHT_SIDEBAR_SINGLE_DEFAULT_SIZE
    : RIGHT_SIDEBAR_MIN_SIZE
}

export function getRightSidebarDockSizes({
  fixedSinglePanelWidth,
  navigationSidebarOpen,
  splitDock,
}: {
  fixedSinglePanelWidth?: string
  navigationSidebarOpen: boolean
  splitDock: boolean
}) {
  if (!splitDock && fixedSinglePanelWidth) {
    return {
      defaultSize: fixedSinglePanelWidth,
      maxSize: fixedSinglePanelWidth,
      minSize: fixedSinglePanelWidth,
    }
  }

  return {
    defaultSize: percentage(
      splitDock
        ? RIGHT_SIDEBAR_SPLIT_DEFAULT_SIZE * 2
        : RIGHT_SIDEBAR_SINGLE_DEFAULT_SIZE,
    ),
    maxSize: percentage(
      splitDock
        ? RIGHT_SIDEBAR_SPLIT_MAX_SIZE * 2
        : RIGHT_SIDEBAR_SINGLE_MAX_SIZE,
    ),
    minSize: percentage(
      getRightSidebarDockMinSize(splitDock, navigationSidebarOpen),
    ),
  }
}

export function resolveSidebarPanelPercentage(
  size: string,
  groupWidth: number,
) {
  const value = Number.parseFloat(size)

  if (!Number.isFinite(value)) return 0
  if (size.endsWith("%")) return value
  if (size.endsWith("px")) {
    return groupWidth > 0 ? (value / groupWidth) * 100 : 0
  }

  return value
}

export type SidebarResizeIntent = "increase" | "decrease"

export function getSidebarResizeIntent(
  horizontalDelta: number,
  threshold = 4,
): SidebarResizeIntent | null {
  if (Math.abs(horizontalDelta) < threshold) return null
  return horizontalDelta < 0 ? "increase" : "decrease"
}
