import { useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
import { Button } from "@/shared/ui/button"

type TrashedItemBannerProps = {
  itemLabel: "database" | "page"
  onRestore: () => void
  restoring: boolean
  showRestore?: boolean
}

export function TrashedItemBanner({
  itemLabel,
  onRestore,
  restoring,
  showRestore = true,
}: TrashedItemBannerProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <>
      <div className="sticky top-0 z-20 flex min-h-12 items-center justify-between gap-3 border-b bg-effect-backdrop px-4 py-2 text-sm shadow-sm backdrop-blur supports-[backdrop-filter]:bg-effect-backdrop">
        <span className="font-medium">This {itemLabel} is in trash.</span>
        {showRestore ? (
          <Button
            disabled={restoring}
            onClick={() => setConfirmOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            Restore
          </Button>
        ) : null}
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore {itemLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              This {itemLabel} will be moved out of trash and appear in your
              active pages again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={restoring}
              onClick={() => {
                onRestore()
                setConfirmOpen(false)
              }}
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
