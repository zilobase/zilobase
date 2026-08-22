import * as React from "react"

import { Spinner } from "@/components/ui/spinner"
import {
  subscribeDesktopServerSwitch,
  type DesktopServerSwitchProgress,
} from "@/lib/desktop-server-switch"

export function DesktopServerSwitchOverlay() {
  const [progress, setProgress] =
    React.useState<DesktopServerSwitchProgress | null>(null)

  React.useEffect(() => subscribeDesktopServerSwitch(setProgress), [])

  if (!progress) return null

  return (
    <div
      aria-live="polite"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-backdrop backdrop-blur-sm"
      role="status"
    >
      <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
        <Spinner className="size-5" />
        <div>
          <p className="text-sm font-medium">
            Switching to{" "}
            {progress.workspaceName
              ? progress.workspaceName
              : progress.server.displayName}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {progress.server.displayName}
            {progress.server.apiOrigin
              ? ` — ${progress.server.apiOrigin}`
              : ""}
          </p>
        </div>
      </div>
    </div>
  )
}
