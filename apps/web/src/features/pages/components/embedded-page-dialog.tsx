import type { ReactNode } from "react"
import { XIcon } from "@/shared/components/icons"

import {
  Dialog,
  DialogContent,
  DialogDescription,
} from "@/shared/ui/dialog"
import { Button } from "@/shared/ui/button"
import {
  PageScrollViewport,
  usePageSidePane,
} from "../context/page-side-pane"
import { PageWorkspaceGate } from "@/features/workspaces"
import { PagePaneHeader } from "./page-pane-header"
import { useOptionalPageLayoutSidebar } from "../context/page-layout-sidebar"
import type { OpenPageOptions } from "@/features/pages"

export function EmbeddedPageDialog({
  onOpenPage,
  pageRenderer: PageRenderer,
}: {
  onOpenPage: (pageId: string, options?: OpenPageOptions) => void
  pageRenderer: (props: {
    databaseId?: string | null
    layoutPanelMode?: "auto" | "overlay"
    onOpenPage: (pageId: string, options?: OpenPageOptions) => void
    pageId: string
  }) => ReactNode
}) {
  const {
    closeEmbeddedPageDialog,
    dialogDatabaseId,
    dialogPageId,
  } = usePageSidePane()
  const pageLayoutSidebar = useOptionalPageLayoutSidebar()
  const hasLayoutSidebar =
    pageLayoutSidebar?.hasOverlaySidebar(dialogPageId) ?? false
  const closeDialog = () => {
    if (pageLayoutSidebar?.overlayPageId === dialogPageId) {
      pageLayoutSidebar.closeOverlay()
    }
    closeEmbeddedPageDialog()
  }
  const dialogPathname = dialogPageId
    ? `/p/${encodeURIComponent(dialogPageId)}`
    : "/recents"

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          closeDialog()
        }
      }}
      open={dialogPageId !== null}
    >
      <DialogContent
        className="flex h-[90dvh] max-h-[90dvh] min-h-0 w-full flex-col gap-0 overflow-hidden p-0 dark:bg-surface-navigation sm:h-[90vh] sm:max-h-[90vh] sm:max-w-4xl"
        data-page-dialog-panel
        hideMobileDragHandle
        showCloseButton={false}
        unstyledContent
      >
        <DialogDescription className="sr-only">
          Page preview
        </DialogDescription>
        <div
          aria-hidden
          className="mx-auto mt-3 h-1 w-[100px] shrink-0 rounded-full bg-surface-muted sm:hidden"
        />
        <PagePaneHeader
          leadingControl={
            <Button
              aria-label="Close"
              onClick={closeDialog}
              size="icon"
              type="button"
              variant="ghost"
            >
              <XIcon />
            </Button>
          }
          onTogglePageSidebar={
            dialogPageId && hasLayoutSidebar
              ? () => pageLayoutSidebar?.toggleOverlay(dialogPageId)
              : undefined
          }
          pageSidebarOpen={pageLayoutSidebar?.overlayPageId === dialogPageId}
          pathname={dialogPathname}
          rowNavigationDatabaseId={dialogDatabaseId}
          showBreadcrumb={false}
          showPaneControls
        />
        <PageScrollViewport
          className="min-h-0 flex-1"
          edgeFadeClassName="hidden"
        >
          {dialogPageId ? (
            <PageWorkspaceGate pageId={dialogPageId}>
              <PageRenderer
                databaseId={dialogDatabaseId}
                key={dialogPageId}
                layoutPanelMode="overlay"
                onOpenPage={onOpenPage}
                pageId={dialogPageId}
              />
            </PageWorkspaceGate>
          ) : null}
        </PageScrollViewport>
      </DialogContent>
    </Dialog>
  )
}
