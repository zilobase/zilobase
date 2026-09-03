import { getDatabaseId, MainPaneHeaderLeadingControl, PagePaneHeader } from "@/features/pages/components"
import { PageSidePaneHeaderCell, useOptionalPageLayoutSidebar } from "@/features/pages/context"

export function AppHeader({
  discussionsOpen,
  isSettingsPage,
  onToggleDiscussions,
  onTogglePageSidebar,
  pageSidebarOpen,
  onCloseSidePane,
  pathname,
  renderedSidePaneDatabaseId,
  renderedSidePanePageId,
  sidePaneAnimatedOpen,
  sidePaneDatabaseId,
}: {
  discussionsOpen: boolean
  isSettingsPage: boolean
  onToggleDiscussions?: () => void
  onTogglePageSidebar?: () => void
  pageSidebarOpen?: boolean
  onCloseSidePane: () => void
  pathname: string
  renderedSidePaneDatabaseId: string | null
  renderedSidePanePageId: string | null
  sidePaneAnimatedOpen: boolean
  sidePaneDatabaseId: string | null
}) {
  const pageLayoutSidebar = useOptionalPageLayoutSidebar()
  const showSidePaneHeader = Boolean(renderedSidePanePageId || renderedSidePaneDatabaseId)
  const splitActive = showSidePaneHeader && sidePaneAnimatedOpen
  const sidePanePathname = renderedSidePaneDatabaseId
    ? `/d/${encodeURIComponent(renderedSidePaneDatabaseId)}`
    : `/p/${encodeURIComponent(renderedSidePanePageId ?? "")}`
  const routeDatabaseId = getDatabaseId(pathname)
  const rowNavigationDatabaseId = renderedSidePanePageId ? (sidePaneDatabaseId ?? routeDatabaseId) : null
  const sidePaneHasLayoutSidebar = pageLayoutSidebar?.hasOverlaySidebar(renderedSidePanePageId) ?? false

  return (
    <>
      <PageSidePaneHeaderCell className="z-10" side="main" splitActive={splitActive}>
        <PagePaneHeader
          className="min-w-0 flex-1"
          discussionsOpen={discussionsOpen}
          leadingControl={<MainPaneHeaderLeadingControl />}
          onToggleDiscussions={onToggleDiscussions}
          onTogglePageSidebar={onTogglePageSidebar}
          pageSidebarOpen={pageSidebarOpen}
          pathname={pathname}
          showActions={!isSettingsPage}
        />
      </PageSidePaneHeaderCell>
      {showSidePaneHeader ? (
        <PageSidePaneHeaderCell side="side" splitActive={splitActive}>
          <PagePaneHeader
            className="min-w-0 flex-1"
            onClose={onCloseSidePane}
            onTogglePageSidebar={renderedSidePanePageId && sidePaneHasLayoutSidebar
              ? () => pageLayoutSidebar?.toggleOverlay(renderedSidePanePageId)
              : undefined}
            pageSidebarOpen={pageLayoutSidebar?.overlayPageId === renderedSidePanePageId}
            pathname={sidePanePathname}
            rowNavigationDatabaseId={rowNavigationDatabaseId}
            showBreadcrumb={false}
          />
        </PageSidePaneHeaderCell>
      ) : null}
    </>
  )
}
