import { useCallback, useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "@tanstack/react-router"

type SidebarDatabaseViewSelection = {
  databaseId: string
  token: string
  viewId: string | null
}

export function useDatabaseViewNavigation({
  databaseId,
  requestedViewId,
}: {
  databaseId: string
  requestedViewId?: string
}) {
  const navigate = useNavigate()
  const sidebarSelection = useLocation({
    select: (location) =>
      (
        location.state as typeof location.state & {
          zilobaseDatabaseViewSelection?: SidebarDatabaseViewSelection
        }
      ).zilobaseDatabaseViewSelection,
  })
  const [activeViewId, setActiveViewId] = useState<string | undefined>(
    requestedViewId,
  )
  const previousDatabaseIdRef = useRef(databaseId)
  const suppressNextUrlSyncRef = useRef(false)

  useEffect(() => {
    if (previousDatabaseIdRef.current !== databaseId) {
      previousDatabaseIdRef.current = databaseId
      suppressNextUrlSyncRef.current = false
      setActiveViewId(requestedViewId)
      return
    }

    if (suppressNextUrlSyncRef.current && requestedViewId === undefined) {
      suppressNextUrlSyncRef.current = false
      return
    }

    suppressNextUrlSyncRef.current = false
    setActiveViewId(requestedViewId)
  }, [databaseId, requestedViewId])

  useEffect(() => {
    if (sidebarSelection?.databaseId !== databaseId) {
      return
    }

    suppressNextUrlSyncRef.current = false
    setActiveViewId(sidebarSelection.viewId ?? undefined)
  }, [
    databaseId,
    sidebarSelection?.databaseId,
    sidebarSelection?.token,
    sidebarSelection?.viewId,
  ])

  const selectView = useCallback(
    (viewId: string | null) => {
      setActiveViewId(viewId ?? undefined)

      if (!requestedViewId) {
        return
      }

      suppressNextUrlSyncRef.current = true
      void navigate({
        params: { databaseId },
        replace: true,
        search: { view: undefined },
        to: "/d/$databaseId",
      })
    },
    [databaseId, navigate, requestedViewId],
  )

  return { activeViewId, selectView }
}
