import { RouterProvider } from "@tanstack/react-router"

import { DesktopDeepLinkHandler } from "@/components/desktop-deep-link-handler"
import {
  DesktopWindowTitlebar,
  isLinuxDesktopApp,
} from "@/components/desktop-window-titlebar"
import { router } from "@/router"

export default function App() {
  const linuxDesktopApp = isLinuxDesktopApp()
  const app = (
    <>
      <DesktopDeepLinkHandler openPath={(path) => router.history.push(path)} />
      <RouterProvider router={router} />
    </>
  )

  if (!linuxDesktopApp) return app

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background text-foreground [--app-viewport-height:calc(100svh-1.75rem)]">
      <DesktopWindowTitlebar />
      <div className="min-h-0 flex-1 overflow-auto [&>.h-svh]:h-full [&>.min-h-svh]:min-h-full">
        {app}
      </div>
    </div>
  )
}
