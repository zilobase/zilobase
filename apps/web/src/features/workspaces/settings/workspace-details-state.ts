import * as React from "react";

import { toast } from "sonner";

import { getApiErrorMessage } from "@/platform/network/api";

import { useUpdateWorkspace } from "@zilobase/features/workspaces/react";

export function useWorkspaceDetails({
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
  const updateWorkspace = useUpdateWorkspace();
  const initial = workspaceDetailsDraft(workspace);
  const [name, setName] = React.useState(initial.name);
  const [slug, setSlug] = React.useState(initial.slug);
  const [logo, setLogo] = React.useState(initial.logo);
  const [metadata, setMetadata] = React.useState(initial.metadata);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    setName(workspaceDetailsDraft(workspace).name);
    setSlug(workspaceDetailsDraft(workspace).slug);
    setLogo(workspaceDetailsDraft(workspace).logo);
    setMetadata(workspaceDetailsDraft(workspace).metadata);
  }, [workspace]);

  const hasChanges = workspaceDetailsChanged({ name, slug, logo, metadata }, workspace);

  const saveWorkspace = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!workspace) {
      setError("Select an workspace before updating settings.");
      return;
    }

    const trimmedName = name.trim();
    const trimmedSlug = slug.trim().toLowerCase();
    const trimmedLogo = logo.trim();
    const trimmedMetadata = metadata.trim();

    if (!trimmedName) {
      setError("Workspace name is required.");
      return;
    }

    if (!isValidSlug(trimmedSlug)) {
      setError("Use lowercase letters, numbers, and hyphens for the slug.");
      return;
    }

    if (trimmedLogo && !isValidUrl(trimmedLogo)) {
      setError("Enter a valid logo URL.");
      return;
    }

    setError("");
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
          toast.success("Workspace updated.");
        },
        onError: (mutationError) => {
          setError(getApiErrorMessage(mutationError));
        },
      },
    );
  };

  return {
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
  };
}

function isValidSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function workspaceDetailsChanged(
  draft: { name: string; slug: string; logo: string; metadata: string },
  workspace: Parameters<typeof useWorkspaceDetails>[0]["workspace"],
) {
  const { name, slug, logo, metadata } = draft;
  const current = workspaceDetailsDraft(workspace);
  return (
    name.trim() !== current.name.trim() ||
    slug.trim().toLowerCase() !== current.slug.trim().toLowerCase() ||
    logo.trim() !== current.logo.trim() ||
    metadata.trim() !== current.metadata.trim()
  );
}

function workspaceDetailsDraft(workspace: Parameters<typeof useWorkspaceDetails>[0]["workspace"]) {
  return {
    name: workspace?.name ?? "",
    slug: workspace?.slug ?? "",
    logo: workspace?.logo ?? "",
    metadata: workspace?.metadata ?? "",
  };
}
