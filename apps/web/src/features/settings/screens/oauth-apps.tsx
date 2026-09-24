import { useEffect, useState } from "react";

import { SettingsHeader } from "../components/settings-header";
import { Button } from "@/shared/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/shared/ui/item";
import { authFetch, getApiErrorMessage } from "@/platform/network/api";

type OAuthApp = {
  client_id?: string;
  client_name?: string;
  client_secret?: string;
  name?: string;
  redirect_uris?: string[];
};

export default function OAuthAppsSettingsPage() {
  const [apps, setApps] = useState<OAuthApp[]>([]);
  const [name, setName] = useState("");
  const [redirectUris, setRedirectUris] = useState("");
  const [publicClient, setPublicClient] = useState(true);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const result = await authFetch<OAuthApp[] | { clients?: OAuthApp[] }>(
        "/oauth2/get-clients",
        undefined,
        { method: "GET" },
      );
      setApps(Array.isArray(result) ? result : (result.clients ?? []));
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createApp() {
    setError(null);
    setCreatedSecret(null);
    const uris = redirectUris
      .split(/\n|,/)
      .map((uri) => uri.trim())
      .filter(Boolean);
    try {
      const created = await authFetch<OAuthApp>("/oauth2/create-client", {
        application_type: publicClient ? "native" : "web",
        client_name: name.trim() || "OAuth app",
        redirect_uris: uris,
        token_endpoint_auth_method: publicClient ? "none" : "client_secret_basic",
      });
      setCreatedSecret(created.client_secret ?? null);
      setName("");
      setRedirectUris("");
      await load();
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    }
  }

  async function remove(clientId: string) {
    setError(null);
    try {
      await authFetch("/oauth2/delete-client", { client_id: clientId });
      await load();
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        title="OAuth apps"
        description="Register clients that can Sign in with Zilobase. Client secrets are shown once."
      />
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <FieldGroup>
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input onChange={(event) => setName(event.target.value)} value={name} />
          </Field>
          <Field>
            <FieldLabel>Redirect URIs</FieldLabel>
            <Input
              onChange={(event) => setRedirectUris(event.target.value)}
              placeholder="https://app.example.com/callback"
              value={redirectUris}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={publicClient}
              onChange={(event) => setPublicClient(event.target.checked)}
              type="checkbox"
            />
            Public client (PKCE, no secret)
          </label>
          <Button onClick={() => void createApp()} type="button">
            Create client
          </Button>
        </FieldGroup>
        {createdSecret ? (
          <p className="text-sm text-content-secondary">
            Client secret (copy now): {createdSecret}
          </p>
        ) : null}
        {error ? <p className="text-sm text-content-secondary">{error}</p> : null}
        <ItemGroup>
          {apps.map((app) => {
            const clientId = app.client_id ?? "";
            return (
              <Item key={clientId || app.name}>
                <ItemContent>
                  <ItemTitle>{app.client_name ?? app.name ?? clientId}</ItemTitle>
                  <ItemDescription>
                    {clientId}
                    {app.redirect_uris?.length ? ` · ${app.redirect_uris.join(", ")}` : ""}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  {clientId ? (
                    <Button onClick={() => void remove(clientId)} variant="destructive">
                      Delete
                    </Button>
                  ) : null}
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      </div>
    </main>
  );
}
