import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { PageLayoutScope } from "@notelab/features/pages"

export function DiscussionVisibilityDialog({
  databaseAvailable,
  enabled,
  onApply,
  onOpenChange,
  open,
  pending = false,
}: {
  databaseAvailable: boolean
  enabled: boolean
  onApply: (scope: Extract<PageLayoutScope, "database" | "page">) => void
  onOpenChange: (open: boolean) => void
  open: boolean
  pending?: boolean
}) {
  const action = enabled ? "Enable" : "Disable"

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action} page discussions?</DialogTitle>
          <DialogDescription>
            Choose where this discussion setting should apply.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={() => onApply("page")}
            type="button"
            variant={databaseAvailable ? "outline" : "default"}
          >
            This page
          </Button>
          {databaseAvailable ? (
            <Button
              disabled={pending}
              onClick={() => onApply("database")}
              type="button"
            >
              All pages in this database
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
