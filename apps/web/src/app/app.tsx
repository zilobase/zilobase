import { RouterProvider } from "@tanstack/react-router"

import {
  DesktopDeepLinkHandler,
  DesktopServerReplacementController,
  DesktopServerSwitchOverlay,
  DesktopWindowTitlebar,
  isLinuxDesktopApp,
} from "@/features/desktop/components/index"
import { router } from "@/app/routing/router"

export default function App() {
  const app = (
    <>
      <DesktopServerReplacementController
        openPath={(path) => router.history.push(path)}
      />
      <DesktopDeepLinkHandler openPath={(path) => router.history.push(path)} />
      <DesktopServerSwitchOverlay />
      <RouterProvider router={router} />
    </>
  )

  if (!isLinuxDesktopApp()) return app

  return (
    <div
      className="relative h-svh overflow-hidden bg-surface-canvas text-content-primary"
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
