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
import { getThemeColorScheme, selectableThemeIds } from "@/lib/themes"
import { ThemeFamilyProvider } from "@/providers/theme-family-provider"
import { AppIconProvider } from "@/providers/app-icon-provider"

export function AppProviders({ children }: React.PropsWithChildren) {
  return (
    <AppIconProvider>
      <OfflineQueryProvider client={queryClient}>
        <WebFeaturesProvider>
          <ShortcutProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
              themes={selectableThemeIds}
            >
              <ThemeFamilyProvider>
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
              </ThemeFamilyProvider>
            </ThemeProvider>
          </ShortcutProvider>
        </WebFeaturesProvider>
      </OfflineQueryProvider>
    </AppIconProvider>
  )
}

function ThemeDocumentSync() {
  const { resolvedTheme } = useTheme()

  React.useEffect(() => {
    const colorScheme = getThemeColorScheme(resolvedTheme)
    if (!colorScheme) return

    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')

    document.documentElement.style.colorScheme = colorScheme
    meta?.setAttribute("content", getComputedStyle(document.body).backgroundColor)
  }, [resolvedTheme])

  return null
}
