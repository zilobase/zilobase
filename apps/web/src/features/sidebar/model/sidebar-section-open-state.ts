import * as React from "react"

export function useSidebarSectionOpen(storageKey: string) {
  const [open, setOpenState] = React.useState(() => readSidebarSectionOpen(storageKey))

  React.useEffect(() => {
    setOpenState(readSidebarSectionOpen(storageKey))
  }, [storageKey])

  const setOpen = React.useCallback((nextOpen: boolean) => {
    setOpenState(nextOpen)
    try {
      window.localStorage.setItem(storageKey, nextOpen ? "open" : "closed")
    } catch {
      // The section still remains interactive when storage is unavailable.
    }
  }, [storageKey])

  return [open, setOpen] as const
}

function readSidebarSectionOpen(storageKey: string) {
  try {
    return window.localStorage.getItem(storageKey) !== "closed"
  } catch {
    return true
  }
}
