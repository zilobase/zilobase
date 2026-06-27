import * as React from "react"
import { toast } from "sonner"

import { SettingsHeader } from "@/components/settings-header"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { getApiErrorMessage } from "@/lib/api"
import { useActiveWorkspaceId } from "@notelab/features/integrations"
import {
  useWorkspaces,
  useUpdateWorkspace,
} from "@notelab/features/workspaces"

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

      <div className="mx-auto grid w-full max-w-4xl gap-6">
        <WorkspaceDetailsSection workspace={workspace} />
      </div>
    </main>
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
          <p className="text-sm text-muted-foreground">
            Update the fields used to identify this workspace across Notelab.
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