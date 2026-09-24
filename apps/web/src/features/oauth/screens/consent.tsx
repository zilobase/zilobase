import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useActiveWorkspaceId, useWorkspaces } from "@zilobase/features/workspaces/react";

import { webAuthClient } from "@/app/providers/features-provider";
import { authFetch, getApiErrorMessage } from "@/platform/network/api";
import { Button } from "@/shared/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/shared/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Spinner } from "@/shared/ui/spinner";
import { ZilobaseLogo } from "@/shared/components/zilobase-logo";
import { readOAuthQuery } from "../lib/oauth-query";
import { labelForScope, parseRequestedScopes } from "../lib/scope-labels";

type PublicOAuthClient = {
  client_id?: string;
  client_name?: string;
  name?: string;
};

export default function OAuthConsentPage() {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const workspacesQuery = useWorkspaces();
  const activeWorkspaceId = useActiveWorkspaceId();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"allow" | "deny" | null>(null);
  const [clientName, setClientName] = useState("An application");

  const scopes = parseRequestedScopes(typeof search.scope === "string" ? search.scope : null);
  const workspaces = workspacesQuery.data ?? [];
  const selectedWorkspaceId = selectWorkspaceId(workspaceId, activeWorkspaceId, workspaces);
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);

  useEffect(() => {
    const clientId = typeof search.client_id === "string" ? search.client_id : null;
    if (!clientId) {
      return;
    }

    void authFetch<PublicOAuthClient>(
      `/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`,
      undefined,
      { method: "GET" },
    )
      .then((client) => {
        setClientName(client.client_name ?? client.name ?? "An application");
      })
      .catch(() => {
        setClientName("An application");
      });
  }, [search.client_id]);

  async function submitConsent(accept: boolean) {
    setError(null);
    setPending(accept ? "allow" : "deny");

    try {
      if (accept) {
        if (!selectedWorkspaceId) {
          throw new Error("Choose a workspace to continue.");
        }
        await webAuthClient.setActiveWorkspace(selectedWorkspaceId);
      }

      const result = await authFetch<{ redirect?: boolean; url?: string }>("/oauth2/consent", {
        accept,
        oauth_query: readOAuthQuery(),
        scope: typeof search.scope === "string" ? search.scope.replaceAll("+", " ") : undefined,
      });

      if (result?.url) {
        window.location.assign(result.url);
        return;
      }

      await navigate({ to: "/recents" });
    } catch (cause) {
      setError(getApiErrorMessage(cause));
      setPending(null);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-surface-canvas p-6">
      <div className="w-full max-w-md rounded-xl bg-surface-overlay p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <ZilobaseLogo className="h-6 w-auto" />
          <span className="text-sm font-medium">Zilobase</span>
        </div>
        <h1 className="text-sm font-medium">
          {clientName} wants to access {selectedWorkspace?.name ?? "your workspace"}
        </h1>
        <FieldDescription className="mt-1">
          Choose a workspace and review what this app can do. Page and database permissions still
          apply.
        </FieldDescription>

        <FieldGroup className="mt-4">
          <Field>
            <FieldLabel>Workspace</FieldLabel>
            <WorkspacePicker
              loading={workspacesQuery.isLoading}
              workspaces={workspaces}
              value={selectedWorkspaceId}
              onChange={setWorkspaceId}
            />
          </Field>
        </FieldGroup>

        <ItemGroup className="mt-4" data-size="sm">
          {scopes.map((scope) => {
            const label = labelForScope(scope);
            return (
              <Item key={scope} size="sm" variant="default">
                <ItemContent>
                  <ItemTitle>{label.title}</ItemTitle>
                  <ItemDescription>{label.description}</ItemDescription>
                </ItemContent>
              </Item>
            );
          })}
        </ItemGroup>

        {error ? <FieldError className="mt-3">{error}</FieldError> : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button
            disabled={pending !== null}
            onClick={() => void submitConsent(false)}
            type="button"
            variant="outline"
          >
            {pending === "deny" ? "Canceling…" : "Cancel"}
          </Button>
          <Button
            disabled={pending !== null || !selectedWorkspaceId}
            onClick={() => void submitConsent(true)}
            type="button"
          >
            {pending === "allow" ? "Allowing…" : "Allow"}
          </Button>
        </div>
      </div>
    </main>
  );
}

type WorkspaceOption = { id: string; name: string };

function selectWorkspaceId(
  selected: string | null,
  active: string | null | undefined,
  workspaces: WorkspaceOption[],
) {
  return selected ?? active ?? workspaces[0]?.id ?? null;
}

function WorkspacePicker({
  loading,
  workspaces,
  value,
  onChange,
}: {
  loading: boolean;
  workspaces: WorkspaceOption[];
  value: string | null;
  onChange: (value: string) => void;
}) {
  if (loading) return <Spinner className="size-4" />;
  return (
    <Select onValueChange={onChange} value={value ?? undefined}>
      <SelectTrigger>
        <SelectValue placeholder="Select a workspace" />
      </SelectTrigger>
      <SelectContent>
        {workspaces.map((workspace) => (
          <SelectItem key={workspace.id} value={workspace.id}>
            {workspace.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
