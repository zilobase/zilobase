import * as React from "react";
import { useNavigate } from "@tanstack/react-router";

import { Trash2Icon } from "@/shared/components/icons";
import { toast } from "sonner";

import { Button } from "@/shared/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Field, FieldError, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";

import { Spinner } from "@/shared/ui/spinner";

import { getApiErrorMessage } from "@/platform/network/api";

import { useDeleteWorkspace } from "@zilobase/features/workspaces/react";

export function DeleteWorkspaceSection({
  remainingWorkspaceCount,
  workspace,
}: {
  remainingWorkspaceCount: number;
  workspace: { id: string; name: string } | null;
}) {
  const navigate = useNavigate();
  const deleteWorkspace = useDeleteWorkspace();
  const [open, setOpen] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState("");
  const [error, setError] = React.useState("");
  const matches = confirmation.trim() === workspace?.name;
  const canDelete = Boolean(workspace && matches && !deleteWorkspace.isPending);

  const reset = () => {
    setConfirmation("");
    setError("");
  };

  const confirmDelete = () => {
    if (!workspace || !canDelete) return;

    deleteWorkspace.mutate(
      { confirmationName: confirmation, workspaceId: workspace.id },
      {
        onError: (mutationError) => setError(getApiErrorMessage(mutationError)),
        onSuccess: () => {
          setOpen(false);
          reset();
          toast.success(`Workspace “${workspace.name}” deleted.`);
          if (remainingWorkspaceCount === 0) {
            void navigate({ to: "/onboarding", replace: true });
          }
        },
      },
    );
  };

  return (
    <section className="grid gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h3 className="font-heading text-base leading-snug font-medium">Delete workspace</h3>
          <p className="text-sm text-content-secondary">
            Permanently delete this workspace and all of its pages and data.
          </p>
        </div>
        <Button
          className="shrink-0"
          disabled={!workspace}
          onClick={() => setOpen(true)}
          type="button"
          variant="destructive"
        >
          <Trash2Icon />
          Delete workspace
        </Button>
      </div>

      <AlertDialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (deleteWorkspace.isPending) return;
          setOpen(nextOpen);
          if (!nextOpen) reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Type <strong>{workspace?.name}</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="delete-workspace-confirmation">Workspace name</FieldLabel>
            <Input
              autoComplete="off"
              autoFocus
              disabled={deleteWorkspace.isPending}
              id="delete-workspace-confirmation"
              onChange={(event) => {
                setConfirmation(event.target.value);
                if (error) setError("");
              }}
              value={confirmation}
            />
            <FieldError>{error}</FieldError>
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteWorkspace.isPending}>Cancel</AlertDialogCancel>
            <Button
              disabled={!canDelete}
              onClick={confirmDelete}
              type="button"
              variant="destructive"
            >
              {deleteWorkspace.isPending ? <Spinner /> : <Trash2Icon />}
              {deleteWorkspace.isPending ? "Deleting..." : "Delete workspace"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
