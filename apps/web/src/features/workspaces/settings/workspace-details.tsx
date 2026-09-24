import { useWorkspaceDetails } from "./workspace-details-state";

import { Button } from "@/shared/ui/button";

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";

import { Spinner } from "@/shared/ui/spinner";
import { Textarea } from "@/shared/ui/textarea";

export function WorkspaceDetailsSection({
  workspace,
}: {
  workspace: {
    id: string;
    logo?: string | null;
    metadata?: string | null;
    name: string;
    slug: string;
  } | null;
}) {
  const {
    name,
    setName,
    slug,
    setSlug,
    logo,
    setLogo,
    metadata,
    setMetadata,
    error,
    setError,
    hasChanges,
    saveWorkspace,
    updateWorkspace,
  } = useWorkspaceDetails({ workspace });

  return (
    <section className="grid gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h3 className="font-heading text-base leading-snug font-medium">Page details</h3>
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
      <form className="grid gap-4" id="workspace-details-form" onSubmit={saveWorkspace}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="workspace-name">Workspace name</FieldLabel>
            <Input
              disabled={!workspace || updateWorkspace.isPending}
              id="workspace-name"
              onChange={(event) => {
                setName(event.target.value);
                if (error) {
                  setError("");
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
                setSlug(event.target.value);
                if (error) {
                  setError("");
                }
              }}
              placeholder="acme-labs"
              value={slug}
            />
            <FieldDescription>Lowercase, numbers, and hyphens only.</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="workspace-logo">Logo URL</FieldLabel>
            <Input
              disabled={!workspace || updateWorkspace.isPending}
              id="workspace-logo"
              onChange={(event) => {
                setLogo(event.target.value);
                if (error) {
                  setError("");
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
                setMetadata(event.target.value);
                if (error) {
                  setError("");
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
  );
}
