import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { useManualRecordPlacement } from "../state/manual-record-placement";

export function DatabaseManualPlacementDialog() {
  const placement = useManualRecordPlacement();
  return (
    <AlertDialog
      open={placement.pending}
      onOpenChange={(open) => {
        if (!open) placement.cancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear sorting to reorder?</AlertDialogTitle>
          <AlertDialogDescription>
            Row order is manual. To save this move, Zilobase needs to clear the active sorting
            first.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={placement.clearing}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={placement.clearing}
            onClick={(event) => {
              event.preventDefault();
              void placement.confirm();
            }}
          >
            {placement.clearing ? "Clearing…" : "Clear sorting"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
