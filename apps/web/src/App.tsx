import { RouterProvider } from "@tanstack/react-router"

import { DesktopDeepLinkHandler } from "@/components/desktop-deep-link-handler"
import { router } from "@/router"

export default function App() {
  return (
    <>
      <DesktopDeepLinkHandler openPath={(path) => router.history.push(path)} />
      <RouterProvider router={router} />
    </>
  )
}
