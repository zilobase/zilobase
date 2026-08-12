import * as React from "react"
import { ThemeProvider, useTheme } from "next-themes"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { PageEditorCommentsProvider } from "@/components/page-editor-comments"
import { PageEditorRegistryProvider } from "@/contexts/page-editor-registry"
import { PageCommentsRegistryProvider } from "@/contexts/page-comments-registry"
import { DesktopUpdater } from "@/components/desktop-updater"
import { WebFeaturesProvider } from "@/providers/features-provider"
import { queryClient } from "@/lib/query-client"
import { ShortcutProvider } from "@/shortcuts"
import { OfflineQueryProvider } from "@/providers/offline-provider"

export function AppProviders({ children }: React.PropsWithChildren) {
  return (
    <OfflineQueryProvider client={queryClient}>
      <WebFeaturesProvider>
        <ShortcutProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <ThemeDocumentSync />
            <TooltipProvider>
              <PageEditorRegistryProvider>
                <PageCommentsRegistryProvider>
                  <PageEditorCommentsProvider>
                    {children}
                  </PageEditorCommentsProvider>
                </PageCommentsRegistryProvider>
              </PageEditorRegistryProvider>
              <DesktopUpdater />
              <Toaster />
            </TooltipProvider>
          </ThemeProvider>
        </ShortcutProvider>
      </WebFeaturesProvider>
    </OfflineQueryProvider>
  )
}

function ThemeDocumentSync() {
  const { resolvedTheme } = useTheme()

  React.useEffect(() => {
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return

    const color = resolvedTheme === "dark" ? "#0d0d0f" : "#ffffff"
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')

    document.documentElement.style.colorScheme = resolvedTheme
    meta?.setAttribute("content", color)
  }, [resolvedTheme])

  return null
}
