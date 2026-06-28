import { XIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { usePageSidePane } from "@/contexts/page-side-pane"
import { PageWorkspaceGate } from "@/components/page-workspace-gate"
import { PagePaneHeader } from "@/components/page-pane-header"
import { PageEditorPane } from "@/pages/page"

export function EmbeddedPageDialog({
  onOpenPage,
}: {
  onOpenPage: (pageId: string) => void
}) {
  const {
    closeEmbeddedPageDialog,
    dialogDatabaseId,
    dialogPageId,
  } = usePageSidePane()
  const dialogPathname = dialogPageId
    ? `/page/${encodeURIComponent(dialogPageId)}`
    : "/dashboard"

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          closeEmbeddedPageDialog()
        }
      }}
      open={dialogPageId !== null}
    >
      <DialogContent
        className="flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-h-[90vh] sm:max-w-4xl"
        hideMobileDragHandle
        showCloseButton={false}
        unstyledContent
      >
        <DialogDescription className="sr-only">
          Page preview
        </DialogDescription>
        <div
          aria-hidden
          className="mx-auto mt-3 h-1 w-[100px] shrink-0 rounded-full bg-muted sm:hidden"
        />
        <PagePaneHeader
          leadingControl={
            <Button
              aria-label="Close"
              onClick={closeEmbeddedPageDialog}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <XIcon />
            </Button>
          }
          pathname={dialogPathname}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {dialogPageId ? (
            <PageWorkspaceGate pageId={dialogPageId}>
              <PageEditorPane
                databaseId={dialogDatabaseId}
                key={dialogPageId}
                onOpenPage={onOpenPage}
                pageId={dialogPageId}
              />
            </PageWorkspaceGate>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}