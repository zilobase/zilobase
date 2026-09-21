import { useEffect } from "react"
import { isDesktopApp } from "@/platform/desktop/native"
import { getCurrent, onOpenUrl } from "@/platform/desktop/native"

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
    void getCurrent().then((urls) => {
      if (!disposed && urls) openFirstValidPath(urls)
    })
    void onOpenUrl(openFirstValidPath).then((stopListening) => {
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
