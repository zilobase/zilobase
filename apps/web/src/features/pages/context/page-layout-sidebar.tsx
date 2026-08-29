import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react"

type PageLayoutSidebarContextValue = {
  closeOverlay: () => void
  hasSidebar: boolean
  hasOverlaySidebar: (pageId: string | null) => boolean
  open: boolean
  overlayPageId: string | null
  overlayPanelTarget: HTMLElement | null
  pageId: string | null
  panelTarget: HTMLElement | null
  registerOverlaySidebar: (pageId: string) => () => void
  setHasSidebar: Dispatch<SetStateAction<boolean>>
  setOpen: Dispatch<SetStateAction<boolean>>
  setOverlayPanelTarget: Dispatch<SetStateAction<HTMLElement | null>>
  setPanelTarget: Dispatch<SetStateAction<HTMLElement | null>>
  toggleOverlay: (pageId: string) => void
}

const PageLayoutSidebarContext =
  createContext<PageLayoutSidebarContextValue | null>(null)

function updateRegistrationCount(
  registrations: ReadonlyMap<string, number>,
  pageId: string,
  delta: 1 | -1,
) {
  const next = new Map(registrations)
  const count = (registrations.get(pageId) ?? 0) + delta

  if (count > 0) next.set(pageId, count)
  else next.delete(pageId)

  return next
}

export function PageLayoutSidebarProvider({
  children,
  pageId,
}: {
  children: ReactNode
  pageId: string | null
}) {
  const [hasSidebar, setHasSidebar] = useState(false)
  const [open, setOpen] = useState(false)
  const [overlayPageId, setOverlayPageId] = useState<string | null>(null)
  const [overlayPanelTarget, setOverlayPanelTarget] =
    useState<HTMLElement | null>(null)
  const [overlaySidebarRegistrations, setOverlaySidebarRegistrations] =
    useState<ReadonlyMap<string, number>>(() => new Map())
  const [panelTarget, setPanelTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (!hasSidebar) setOpen(false)
  }, [hasSidebar])

  useEffect(() => {
    if (overlayPageId && !overlaySidebarRegistrations.has(overlayPageId)) {
      setOverlayPageId(null)
    }
  }, [overlayPageId, overlaySidebarRegistrations])

  const closeOverlay = useCallback(() => setOverlayPageId(null), [])
  const hasOverlaySidebar = useCallback(
    (targetPageId: string | null) =>
      Boolean(targetPageId && overlaySidebarRegistrations.has(targetPageId)),
    [overlaySidebarRegistrations],
  )
  const registerOverlaySidebar = useCallback((targetPageId: string) => {
    setOverlaySidebarRegistrations((current) =>
      updateRegistrationCount(current, targetPageId, 1),
    )

    return () => {
      setOverlaySidebarRegistrations((current) =>
        updateRegistrationCount(current, targetPageId, -1),
      )
    }
  }, [])
  const toggleOverlay = useCallback((targetPageId: string) => {
    setOverlayPageId((current) =>
      current === targetPageId ? null : targetPageId,
    )
  }, [])

  const value = useMemo(
    () => ({
      closeOverlay,
      hasSidebar,
      hasOverlaySidebar,
      open,
      overlayPageId,
      overlayPanelTarget,
      pageId,
      panelTarget,
      registerOverlaySidebar,
      setHasSidebar,
      setOpen,
      setOverlayPanelTarget,
      setPanelTarget,
      toggleOverlay,
    }),
    [
      closeOverlay,
      hasOverlaySidebar,
      hasSidebar,
      open,
      overlayPageId,
      overlayPanelTarget,
      pageId,
      panelTarget,
      registerOverlaySidebar,
      toggleOverlay,
    ],
  )

  return (
    <PageLayoutSidebarContext.Provider value={value}>
      {children}
    </PageLayoutSidebarContext.Provider>
  )
}

export function useOptionalPageLayoutSidebar() {
  return useContext(PageLayoutSidebarContext)
}
