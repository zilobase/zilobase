import { useEffect } from "react"
import { isTauri } from "@tauri-apps/api/core"
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link"

import { getDesktopDeepLinkPath } from "@/lib/desktop-deep-link"

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
      const pathUrl = urls.find((url) => getDesktopDeepLinkPath(url))
      if (!pathUrl || handledUrls.has(pathUrl)) return
      handledUrls.add(pathUrl)

      const path = getDesktopDeepLinkPath(pathUrl)
      if (path) openPath(path)
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
