import { ArrowRight, FilePenLine, Table2 } from "@/shared/components/icons"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { DatabaseFormView } from "../form/view/database-form-view"

export function DatabaseViewToolbarDialogs({
  formDialogOpen,
  formPreviewOpen,
  formQuestionCount,
  isAddingDatabaseView,
  onCreateForm,
  onDeleteView,
  onFormDialogOpenChange,
  onFormPreviewOpenChange,
  onPendingDeleteOpenChange,
  pendingDeleteViewName,
}: {
  formDialogOpen: boolean
  formPreviewOpen: boolean
  formQuestionCount: number
  isAddingDatabaseView: boolean
  onCreateForm: (includeExistingProperties: boolean) => void
  onDeleteView: () => void
  onFormDialogOpenChange: (open: boolean) => void
  onFormPreviewOpenChange: (open: boolean) => void
  onPendingDeleteOpenChange: (open: boolean) => void
  pendingDeleteViewName: string | null
}) {
  return (
    <>
      <AlertDialog
        onOpenChange={onPendingDeleteOpenChange}
        open={pendingDeleteViewName !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this view?</AlertDialogTitle>
            <AlertDialogDescription>
              {`“${pendingDeleteViewName}” will be removed. Its data source remains linked and can be used to create another view later.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-col-reverse">
            <AlertDialogCancel className="w-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="w-full"
              onClick={onDeleteView}
              variant="destructive"
            >
              Delete view
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={formDialogOpen} onOpenChange={onFormDialogOpenChange}>
        <DialogContent className="gap-5 p-5 sm:max-w-sm" showCloseButton={false}>
          <DialogHeader className="items-center gap-3 text-center">
            <div
              aria-hidden
              className="flex items-center justify-center gap-3 text-content-secondary"
            >
              <Table2 className="size-7" />
              <ArrowRight className="size-5" />
              <FilePenLine className="size-7" />
            </div>
            <div className="space-y-2">
              <DialogTitle className="text-base font-semibold">
                Auto-create form questions based on existing properties?
              </DialogTitle>
              <DialogDescription className="text-sm">
                Every database property will be added as a form question.
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              className="w-full"
              disabled={isAddingDatabaseView}
              onClick={() => onCreateForm(true)}
              type="button"
            >
              Create {formQuestionCount}{" "}
              {formQuestionCount === 1 ? "question" : "questions"}
            </Button>
            <Button
              className="w-full text-content-secondary"
              disabled={isAddingDatabaseView}
              onClick={() => onCreateForm(false)}
              type="button"
              variant="ghost"
            >
              Start from scratch
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={formPreviewOpen} onOpenChange={onFormPreviewOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-3xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Form preview</DialogTitle>
            <DialogDescription>
              Preview how this form appears to respondents.
            </DialogDescription>
          </DialogHeader>
          <DatabaseFormView preview />
        </DialogContent>
      </Dialog>
    </>
  )
}
