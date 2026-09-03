import type { BlockDragPayload } from "@/packages/editor/components/editor/block-drag"
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

export type PendingDatabaseBlockDrop = {
  canMove: boolean
  databaseId: string
  payload: BlockDragPayload
  pos: number
}

export function DatabaseBlockDropDialog({ onClose, onCopy, onMove, pending }: {
  onClose: () => void
  onCopy: () => void
  onMove: () => void
  pending: PendingDatabaseBlockDrop | null
}) {
  return (
    <AlertDialog onOpenChange={(open) => { if (!open) onClose() }} open={pending !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending?.canMove ? "Move database or create a linked view?" : "This database can’t be moved here"}</AlertDialogTitle>
          <AlertDialogDescription>
            {pending?.canMove
              ? "Move the database into this page, or leave the original where it is and create a linked view here."
              : "This page is part of the database. Moving the database here would create a circular hierarchy, but you can create a linked view instead."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onCopy} variant={pending?.canMove ? "outline" : "default"}>Create linked view</AlertDialogAction>
          {pending?.canMove ? <AlertDialogAction onClick={onMove}>Move</AlertDialogAction> : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
