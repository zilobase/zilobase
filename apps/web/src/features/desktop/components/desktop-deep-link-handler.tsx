import { useEffect } from "react"
import { desktopBridge, isDesktopApp } from "@/platform/desktop/native"
import type { DesktopDeepLink } from "../../../../../desktop/electron/shared/bridge"

import { resolveDesktopDeepLinkAction } from "../deep-links/desktop-deep-link"
import { recordDesktopDiagnostic } from "../../../platform/diagnostics/desktop-diagnostics"
import { getSelectedDesktopServer } from "../../../platform/server/desktop-server"
import { requestDesktopServerReplacement } from "../server/desktop-server-replacement"

export function DesktopDeepLinkHandler({
  openPath,
}: {
  openPath: (path: string) => void
}) {
  useEffect(() => {
    if (!isDesktopApp()) return

    let disposed = false
    let unlisten: (() => void) | undefined
    const handledUrls = new Set<string>()
    const openFirstValidPath = (urls: string[]) => {
      for (const url of urls) {
        if (handledUrls.has(url)) continue
        handledUrls.add(url)
        const action = resolveDesktopDeepLinkAction(
          url,
          getSelectedDesktopServer(),
        )
        if (!action) {
          recordDesktopDiagnostic(
            "deep_link.rejected",
            { error_type: "InvalidLink", status: "error" },
            "warn",
          )
          continue
        }

        recordDesktopDiagnostic("deep_link.accepted", { status: "success" })
        if (action.type === "open-path") openPath(action.path)
        else requestDesktopServerReplacement(action)
        return
      }
    }
    const toUrl = (link: DesktopDeepLink) => {
      const url = new URL(`zilobase://${link.type}`)
      url.searchParams.set("server", link.serverUrl)
      if (link.type === "open") {
        url.searchParams.set("instance", link.instanceId)
        url.searchParams.set("path", link.path)
      }
      return url.toString()
    }
    const bridge = desktopBridge().deepLinks
    void bridge.getPending().then((links) => {
      if (!disposed) openFirstValidPath(links.map(toUrl))
    })
    unlisten = bridge.onOpen((links) => openFirstValidPath(links.map(toUrl)))

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [openPath])

  return null
}
