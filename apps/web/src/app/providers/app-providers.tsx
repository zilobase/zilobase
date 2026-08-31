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
import {
  ThemeFamilyProvider,
  useThemeFamily,
} from "@/shared/providers/theme-family-provider"
import { AppIconProvider } from "@/shared/components/app-icon-provider"
import { DemoExperience } from "@/features/demo"
import { useNavigationRealtime } from "@zilobase/features/pages"
import { useActiveWorkspaceId } from "@zilobase/features/workspaces"

export function AppProviders({ children }: React.PropsWithChildren) {
  return (
    <AppIconProvider>
      <OfflineQueryProvider client={queryClient}>
        <WebFeaturesProvider>
          <NavigationRealtimeSync />
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
                <DemoExperience>
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
                </DemoExperience>
              </ThemeFamilyProvider>
            </ThemeProvider>
          </ShortcutProvider>
        </WebFeaturesProvider>
      </OfflineQueryProvider>
    </AppIconProvider>
  )
}

function NavigationRealtimeSync() {
  useNavigationRealtime(useActiveWorkspaceId())
  return null
}

function ThemeDocumentSync() {
  const { resolvedTheme } = useTheme()
  const { themeFamily } = useThemeFamily()

  React.useEffect(() => {
    const colorScheme = getThemeColorScheme(resolvedTheme)
    if (!colorScheme) return

    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')

    document.documentElement.dataset.themeFamily = themeFamily
    document.documentElement.style.colorScheme = colorScheme
    meta?.setAttribute("content", getComputedStyle(document.body).backgroundColor)
  }, [resolvedTheme, themeFamily])

  return null
}
