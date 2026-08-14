import { RouterProvider } from "@tanstack/react-router"

import { DesktopDeepLinkHandler } from "@/components/desktop-deep-link-handler"
import { DesktopServerReplacementController } from "@/components/desktop-server-replacement-controller"
import {
  DesktopWindowTitlebar,
  isLinuxDesktopApp,
} from "@/components/desktop-window-titlebar"
import { router } from "@/router"

export default function App() {
  const app = (
    <>
      <DesktopServerReplacementController
        openPath={(path) => router.history.push(path)}
      />
      <DesktopDeepLinkHandler openPath={(path) => router.history.push(path)} />
      <RouterProvider router={router} />
    </>
  )

  if (!isLinuxDesktopApp()) return app

  return (
    <div
      className="relative h-svh overflow-hidden bg-background text-foreground"
      data-desktop-linux-shell
    >
      <DesktopWindowTitlebar variant="fallback">
        <div
          className="min-w-0 flex-1 self-stretch"
          data-tauri-drag-region="deep"
        />
      </DesktopWindowTitlebar>
      <div
        className="h-full min-h-0 overflow-auto pt-9 [&>.h-svh]:h-full [&>.min-h-svh]:min-h-full"
        data-desktop-app-content
      >
        {app}
      </div>
    </div>
  )
}
