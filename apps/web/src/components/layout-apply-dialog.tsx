import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import type { PageLayoutScope } from "@zilobase/features/pages"

type ApplyScope = Extract<PageLayoutScope, "database" | "page">

type LayoutApplyDialogProps = {
  databaseAvailable: boolean
  onApply: (scope: ApplyScope) => void
  onOpenChange: (open: boolean) => void
  open: boolean
  pageAvailable: boolean
  pending?: boolean
}

export function LayoutApplyDialog({
  databaseAvailable,
  onApply,
  onOpenChange,
  open,
  pageAvailable,
  pending = false,
}: LayoutApplyDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="z-[110]" overlayClassName="z-[109]">
        <DialogHeader>
          <DialogTitle>Apply this layout?</DialogTitle>
          <DialogDescription>
            Choose which pages should use all of these layout settings.
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
          {pageAvailable ? (
            <Button
              disabled={pending}
              onClick={() => onApply("page")}
              type="button"
              variant={databaseAvailable ? "outline" : "default"}
            >
              This page
            </Button>
          ) : null}
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
