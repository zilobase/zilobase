import { useEffect } from "react"
import { isTauri } from "@tauri-apps/api/core"
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link"

import { resolveDesktopDeepLinkAction } from "@/lib/desktop-deep-link"
import { recordDesktopDiagnostic } from "@/lib/desktop-diagnostics"
import { getSelectedDesktopServer } from "@/lib/desktop-server"
import { requestDesktopServerReplacement } from "@/lib/desktop-server-replacement"

export function DesktopDeepLinkHandler({
  openPath,
}: {
  openPath: (path: string) => void
}) {
  useEffect(() => {
    if (!isTauri()) return

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
