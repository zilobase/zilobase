import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trash2Icon, UploadIcon } from "@/shared/components/icons"
import { toast } from "sonner"

import { SettingsHeader } from "@/features/settings"
import { isFeatureEnabled } from "@/shared/config/feature-flags"
import { Button } from "@/shared/ui/button"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Separator } from "@/shared/ui/separator"
import { Spinner } from "@/shared/ui/spinner"
import { Textarea } from "@/shared/ui/textarea"
import { getApiErrorMessage } from "@/features/desktop/network/api"
import { useNotionImport } from "@/features/notion-import/index"
import { useActiveWorkspaceId } from "@zilobase/features/workspaces"
import {
  useWorkspaces,
  useDeleteWorkspace,
  useUpdateWorkspace,
} from "@zilobase/features/workspaces"

export default function WorkspaceSettingsPage() {
  const activeWorkspaceId = useActiveWorkspaceId()
  const { data: workspaces = [] } = useWorkspaces()
  const workspace =
    workspaces.find((item) => item.id === activeWorkspaceId) ?? null

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        title="Workspace"
        description="Manage page details, billing identity, and defaults."
      />

      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <WorkspaceDetailsSection workspace={workspace} />
        {isFeatureEnabled("notionImport") ? (
          <>
            <Separator />
            <WorkspaceImportSection workspaceId={activeWorkspaceId} />
          </>
        ) : null}
        <Separator />
        <DeleteWorkspaceSection
          remainingWorkspaceCount={Math.max(0, workspaces.length - 1)}
          workspace={workspace}
        />
      </div>
    </main>
  )
}

function DeleteWorkspaceSection({
  remainingWorkspaceCount,
  workspace,
}: {
  remainingWorkspaceCount: number
  workspace: { id: string; name: string } | null
}) {
  const navigate = useNavigate()
  const deleteWorkspace = useDeleteWorkspace()
  const [open, setOpen] = React.useState(false)
  const [confirmation, setConfirmation] = React.useState("")
  const [error, setError] = React.useState("")
  const matches = confirmation.trim() === workspace?.name
  const canDelete = Boolean(workspace && matches && !deleteWorkspace.isPending)

  const reset = () => {
    setConfirmation("")
    setError("")
  }

  const confirmDelete = () => {
    if (!workspace || !canDelete) return

    deleteWorkspace.mutate(
      { confirmationName: confirmation, workspaceId: workspace.id },
      {
        onError: (mutationError) => setError(getApiErrorMessage(mutationError)),
        onSuccess: () => {
          setOpen(false)
          reset()
          toast.success(`Workspace “${workspace.name}” deleted.`)
          if (remainingWorkspaceCount === 0) {
            void navigate({ to: "/onboarding", replace: true })
          }
        },
      },
    )
  }

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
          if (deleteWorkspace.isPending) return
          setOpen(nextOpen)
          if (!nextOpen) reset()
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
                setConfirmation(event.target.value)
                if (error) setError("")
              }}
              value={confirmation}
            />
            <FieldError>{error}</FieldError>
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteWorkspace.isPending}>Cancel</AlertDialogCancel>
            <Button disabled={!canDelete} onClick={confirmDelete} type="button" variant="destructive">
              {deleteWorkspace.isPending ? <Spinner /> : <Trash2Icon />}
              {deleteWorkspace.isPending ? "Deleting..." : "Delete workspace"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function WorkspaceImportSection({
  workspaceId,
}: {
  workspaceId: string | null | undefined
}) {
  const {
    handleImportFile,
    inputRef,
    isImporting,
    openImportPicker,
  } = useNotionImport({ workspaceId })

  return (
    <section className="grid gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-heading text-base leading-snug font-medium">
            Import
          </h3>
          <p className="text-sm text-content-secondary">
            Bring pages into this workspace from a Notion HTML zip export.
          </p>
        </div>
        <Button
          className="shrink-0"
          disabled={!workspaceId || isImporting}
          onClick={openImportPicker}
          type="button"
        >
          {isImporting ? <Spinner /> : <UploadIcon />}
          Import Notion
        </Button>
      </div>
      <input
        accept=".zip,application/zip"
        className="sr-only"
        onChange={(event) => {
          void handleImportFile(event)
        }}
        ref={inputRef}
        type="file"
      />
    </section>
  )
}

function WorkspaceDetailsSection({
  workspace,
}: {
  workspace: {
    id: string
    logo?: string | null
    metadata?: string | null
    name: string
    slug: string
  } | null
}) {
  const updateWorkspace = useUpdateWorkspace()
  const [name, setName] = React.useState(workspace?.name ?? "")
  const [slug, setSlug] = React.useState(workspace?.slug ?? "")
  const [logo, setLogo] = React.useState(workspace?.logo ?? "")
  const [metadata, setMetadata] = React.useState(workspace?.metadata ?? "")
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    setName(workspace?.name ?? "")
    setSlug(workspace?.slug ?? "")
    setLogo(workspace?.logo ?? "")
    setMetadata(workspace?.metadata ?? "")
  }, [workspace])

  const hasChanges =
    name.trim() !== (workspace?.name ?? "").trim() ||
    slug.trim().toLowerCase() !== (workspace?.slug ?? "").trim().toLowerCase() ||
    logo.trim() !== (workspace?.logo ?? "").trim() ||
    metadata.trim() !== (workspace?.metadata ?? "").trim()

  const saveWorkspace = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!workspace) {
      setError("Select an workspace before updating settings.")
      return
    }

    const trimmedName = name.trim()
    const trimmedSlug = slug.trim().toLowerCase()
    const trimmedLogo = logo.trim()
    const trimmedMetadata = metadata.trim()

    if (!trimmedName) {
      setError("Workspace name is required.")
      return
    }

    if (!isValidSlug(trimmedSlug)) {
      setError("Use lowercase letters, numbers, and hyphens for the slug.")
      return
    }

    if (trimmedLogo && !isValidUrl(trimmedLogo)) {
      setError("Enter a valid logo URL.")
      return
    }

    setError("")
    updateWorkspace.mutate(
      {
        workspaceId: workspace.id,
        logo: trimmedLogo || null,
        metadata: trimmedMetadata || null,
        name: trimmedName,
        slug: trimmedSlug,
      },
      {
        onSuccess: () => {
          toast.success("Workspace updated.")
        },
        onError: (mutationError) => {
          setError(getApiErrorMessage(mutationError))
        },
      },
    )
  }

  return (
    <section className="grid gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h3 className="font-heading text-base leading-snug font-medium">
            Page details
          </h3>
          <p className="text-sm text-content-secondary">
            Update the fields used to identify this workspace across Zilobase.
          </p>
        </div>
        <Button
          className="shrink-0"
          disabled={!workspace || !hasChanges || updateWorkspace.isPending}
          form="workspace-details-form"
          type="submit"
        >
          {updateWorkspace.isPending ? <Spinner /> : null}
          Save workspace
        </Button>
      </div>
      <form
        className="grid gap-4"
        id="workspace-details-form"
        onSubmit={saveWorkspace}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="workspace-name">Workspace name</FieldLabel>
            <Input
              disabled={!workspace || updateWorkspace.isPending}
              id="workspace-name"
              onChange={(event) => {
                setName(event.target.value)
                if (error) {
                  setError("")
                }
              }}
              placeholder="Acme Labs"
              value={name}
            />
          </Field>

          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="workspace-slug">Slug</FieldLabel>
            <Input
              disabled={!workspace || updateWorkspace.isPending}
              id="workspace-slug"
              onChange={(event) => {
                setSlug(event.target.value)
                if (error) {
                  setError("")
                }
              }}
              placeholder="acme-labs"
              value={slug}
            />
            <FieldDescription>
              Lowercase, numbers, and hyphens only.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="workspace-logo">Logo URL</FieldLabel>
            <Input
              disabled={!workspace || updateWorkspace.isPending}
              id="workspace-logo"
              onChange={(event) => {
                setLogo(event.target.value)
                if (error) {
                  setError("")
                }
              }}
              placeholder="https://example.com/logo.png"
              type="url"
              value={logo}
            />
          </Field>

          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="workspace-metadata">Metadata</FieldLabel>
            <Textarea
              disabled={!workspace || updateWorkspace.isPending}
              id="workspace-metadata"
              onChange={(event) => {
                setMetadata(event.target.value)
                if (error) {
                  setError("")
                }
              }}
              placeholder="Add any workspace-specific notes or identifiers."
              rows={5}
              value={metadata}
            />
            <FieldDescription>
              Optional notes or internal descriptors for this page.
            </FieldDescription>
            <FieldError>{error}</FieldError>
          </Field>
        </FieldGroup>
      </form>
    </section>
  )
}

function isValidSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
}

function isValidUrl(value: string) {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}
