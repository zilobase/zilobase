import { useEffect } from "react"
import { isTauri } from "@tauri-apps/api/core"
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link"

import { authFetch } from "@/lib/api"
import {
  getDesktopAuthDeepLink,
  getDesktopDeepLinkPath,
} from "@/lib/desktop-deep-link"
import { queryClient } from "@/lib/query-client"

export function DesktopDeepLinkHandler({
  openPath,
}: {
  openPath: (path: string) => void
}) {
  useEffect(() => {
    if (!isTauri()) return

    let disposed = false
    let unlisten: (() => void) | undefined
    const openFirstValidPath = async (urls: string[]) => {
      const authLink = urls.map(getDesktopAuthDeepLink).find(Boolean)
      if (authLink) {
        try {
          await authFetch("/one-time-token/verify", { token: authLink.token })
          await queryClient.invalidateQueries({ queryKey: ["session"] })
          openPath(authLink.path)
        } catch {
          openPath("/login?desktopAuthError=1")
        }
        return
      }

      const path = urls.map(getDesktopDeepLinkPath).find(Boolean)
      if (path) openPath(path)
    }

    void getCurrent().then((urls) => {
      if (!disposed && urls) void openFirstValidPath(urls)
    })
    void onOpenUrl((urls) => void openFirstValidPath(urls)).then((stopListening) => {
      if (disposed) stopListening()
      else unlisten = stopListening
    })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [openPath])

  return null
}
