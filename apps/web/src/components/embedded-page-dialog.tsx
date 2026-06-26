import { XIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useWorkspaceSidePane } from "@/contexts/workspace-side-pane"
import { WorkspaceOrganizationGate } from "@/components/workspace-organization-gate"
import { WorkspacePaneHeader } from "@/components/workspace-pane-header"
import { WorkspaceEditorPane } from "@/pages/workspace"

export function EmbeddedPageDialog({
  onOpenPage,
}: {
  onOpenPage: (pageId: string) => void
}) {
  const {
    closeEmbeddedPageDialog,
    dialogDatabaseId,
    dialogWorkspaceId,
  } = useWorkspaceSidePane()
  const dialogPathname = dialogWorkspaceId
    ? `/workspace/${encodeURIComponent(dialogWorkspaceId)}`
    : "/dashboard"

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          closeEmbeddedPageDialog()
        }
      }}
      open={dialogWorkspaceId !== null}
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
        <WorkspacePaneHeader
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
          {dialogWorkspaceId ? (
            <WorkspaceOrganizationGate workspaceId={dialogWorkspaceId}>
              <WorkspaceEditorPane
                databaseId={dialogDatabaseId}
                key={dialogWorkspaceId}
                onOpenPage={onOpenPage}
                workspaceId={dialogWorkspaceId}
              />
            </WorkspaceOrganizationGate>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}