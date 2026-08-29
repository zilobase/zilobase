import * as React from "react"
import { ThemeProvider, useTheme } from "next-themes"

import { Toaster } from "@/shared/ui/sonner"
import { TooltipProvider } from "@/shared/ui/tooltip"
import { PageEditorCommentsProvider } from "@/features/comments/index"
import { PageEditorRegistryProvider } from "@/features/editor/runtime/page-editor-registry"
import { PageCommentsRegistryProvider } from "@/features/comments/index"
import { DesktopUpdater } from "@/features/desktop/components/index"
import { WebFeaturesProvider } from "@/app/providers/features-provider"
import { queryClient } from "@/shared/lib/query-client"
import { ShortcutProvider } from "@/shared/shortcuts"
import { OfflineQueryProvider } from "@/features/offline/index"
import { getThemeColorScheme, selectableThemeIds } from "@/shared/lib/themes"
import { ThemeFamilyProvider } from "@/shared/providers/theme-family-provider"
import { AppIconProvider } from "@/shared/components/app-icon-provider"

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
