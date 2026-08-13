import { useEffect } from "react"
import { isTauri } from "@tauri-apps/api/core"
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link"

import { ApiError, authFetch } from "@/lib/api"
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
    let focusTimer: number | undefined
    let unlisten: (() => void) | undefined
    const handledUrls = new Set<string>()
    const openFirstValidPath = async (urls: string[]) => {
      const authUrl = urls.find((url) => getDesktopAuthDeepLink(url))
      if (authUrl) {
        if (handledUrls.has(authUrl)) return
        handledUrls.add(authUrl)

        const authLink = getDesktopAuthDeepLink(authUrl)
        if (!authLink) return

        console.info("[zilobase][desktop-auth] received authentication callback", {
          path: describePath(authLink.path),
        })

        try {
          await authFetch("/one-time-token/verify", { token: authLink.token })
          console.info("[zilobase][desktop-auth] callback verification succeeded")
          await queryClient.invalidateQueries({ queryKey: ["session"] })
          openPath(authLink.path)
        } catch (error) {
          console.error(
            "[zilobase][desktop-auth] callback verification failed",
            describeError(error),
          )
          openPath("/login?desktopAuthError=1")
        }
        return
      }

      const pathUrl = urls.find((url) => getDesktopDeepLinkPath(url))
      if (!pathUrl || handledUrls.has(pathUrl)) return
      handledUrls.add(pathUrl)

      const path = getDesktopDeepLinkPath(pathUrl)
      if (path) openPath(path)
    }
    const openCurrent = () => {
      void getCurrent().then((urls) => {
        if (!disposed && urls) void openFirstValidPath(urls)
      })
    }
    const handleFocus = () => {
      window.clearTimeout(focusTimer)
      focusTimer = window.setTimeout(openCurrent, 100)
    }

    openCurrent()
    void onOpenUrl((urls) => void openFirstValidPath(urls)).then((stopListening) => {
      if (disposed) stopListening()
      else unlisten = stopListening
    })
    window.addEventListener("focus", handleFocus)

    return () => {
      disposed = true
      window.clearTimeout(focusTimer)
      window.removeEventListener("focus", handleFocus)
      unlisten?.()
    }
  }, [openPath])

  return null
}

function describeError(error: unknown) {
  if (!(error instanceof Error)) return "Unknown error"

  return {
    name: error.name,
    ...(error instanceof ApiError ? { status: error.status } : {}),
  }
}

function describePath(path: string) {
  return new URL(path, "https://app.zilobase.com").pathname
}
