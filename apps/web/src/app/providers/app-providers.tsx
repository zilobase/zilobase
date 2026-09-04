import * as React from "react"
import { ThemeProvider, useTheme } from "next-themes"

import { Toaster } from "@/shared/ui/sonner"
import { TooltipProvider } from "@/shared/ui/tooltip"
import { PageEditorCommentsProvider } from "@/features/comments/index"
import { PageEditorRegistryProvider } from "@/features/editor/runtime/page-editor-registry"
import { PageCommentsRegistryProvider } from "@/features/comments/index"
import { DesktopUpdater } from "@/features/desktop/components/index"
import { WebFeaturesProvider } from "@/app/providers/features-provider"
import { queryClient } from "@/app/query-client"
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
import { useSession } from "@zilobase/features/auth"

import posthog from "@/shared/lib/posthog"

export function AppProviders({ children }: React.PropsWithChildren) {
  return (
    <AppIconProvider>
      <OfflineQueryProvider client={queryClient}>
        <WebFeaturesProvider>
          <PostHogIdentitySync />
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

function PostHogIdentitySync() {
  const { data: session } = useSession()
  const workspaceId = useActiveWorkspaceId()
  const previousUserId = React.useRef<string | null | undefined>(undefined)
  const user = session?.user

  React.useEffect(() => {
    if (!posthog || session === undefined) return

    if (!user) {
      resetSignedOutPostHogIdentity(posthog, previousUserId)
      return
    }

    syncSignedInPostHogIdentity(posthog, previousUserId, user.id)
    syncPostHogWorkspace(posthog, workspaceId)
  }, [session, user, workspaceId])

  return null
}

type ConfiguredPostHog = NonNullable<typeof posthog>

function resetSignedOutPostHogIdentity(
  client: ConfiguredPostHog,
  previousUserId: React.MutableRefObject<string | null | undefined>,
) {
  if (
    previousUserId.current &&
    client.get_distinct_id() === previousUserId.current
  ) {
    client.reset()
  }
  previousUserId.current = null
}

function syncSignedInPostHogIdentity(
  client: ConfiguredPostHog,
  previousUserId: React.MutableRefObject<string | null | undefined>,
  userId: string,
) {
  if (previousUserId.current !== userId) {
    if (previousUserId.current) client.reset()
    client.identify(userId)
    previousUserId.current = userId
    return
  }

  if (client.get_distinct_id() !== userId) client.identify(userId)
}

function syncPostHogWorkspace(
  client: ConfiguredPostHog,
  workspaceId: string | null | undefined,
) {
  if (workspaceId) client.group("workspace", workspaceId)
  else client.resetGroups()
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
