import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react"

type PageLayoutSidebarContextValue = {
  hasSidebar: boolean
  open: boolean
  pageId: string | null
  panelTarget: HTMLElement | null
  setHasSidebar: Dispatch<SetStateAction<boolean>>
  setOpen: Dispatch<SetStateAction<boolean>>
  setPanelTarget: Dispatch<SetStateAction<HTMLElement | null>>
}

const PageLayoutSidebarContext =
  createContext<PageLayoutSidebarContextValue | null>(null)

export function PageLayoutSidebarProvider({
  children,
  pageId,
}: {
  children: ReactNode
  pageId: string | null
}) {
  const [hasSidebar, setHasSidebar] = useState(false)
  const [open, setOpen] = useState(false)
  const [panelTarget, setPanelTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (!hasSidebar) setOpen(false)
  }, [hasSidebar])

  const value = useMemo(
    () => ({
      hasSidebar,
      open,
      pageId,
      panelTarget,
      setHasSidebar,
      setOpen,
      setPanelTarget,
    }),
    [hasSidebar, open, pageId, panelTarget],
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
