import { useEffect, useState } from "react";
import { browser } from "wxt/browser";

import { Button } from "@/shared/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { clearSession, readSession, writeSession } from "../../lib/session";

export function OptionsApp() {
  const [instanceUrl, setInstanceUrl] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const pending = await browser.storage.local.get("clipper.pendingInstanceUrl");
      const session = await readSession();
      setInstanceUrl(
        session?.instanceUrl ?? (pending["clipper.pendingInstanceUrl"] as string | undefined) ?? "",
      );
      if (!session) return;
      setWorkspaceId(session.workspaceId);
      setWorkspaceName(session.workspaceName);
    })();
  }, []);

  const connectWithOAuth = async () => {
    const origin = instanceUrl.trim().replace(/\/$/, "");
    if (!origin) {
      setStatus("Enter your Zilobase server URL.");
      return;
    }
    setStatus("Opening Zilobase…");
    const result = (await browser.runtime.sendMessage({
      instanceUrl: origin,
      type: "CLIPPER_OAUTH_START",
    })) as { error?: string; ok?: boolean } | undefined;
    if (result && result.ok === false) {
      setStatus(result.error ?? "Connect failed");
      return;
    }
    setStatus("Finish signing in in the opened tab.");
  };

  const save = async () => {
    await writeSession({
      instanceUrl: instanceUrl.trim().replace(/\/$/, ""),
      workspaceId: workspaceId.trim(),
      workspaceName: workspaceName.trim() || "Workspace",
      token: token.trim(),
    });
    setToken("");
    setStatus("Connected. You can close this tab.");
  };

  const disconnect = async () => {
    await clearSession();
    setToken("");
    setStatus("Disconnected.");
  };

  return (
    <main className="min-h-svh bg-surface-canvas px-4 py-8 text-content-primary">
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <div className="flex flex-col">
          <h1 className="text-xl font-semibold tracking-normal">Web Clipper</h1>
          <p className="text-sm text-content-secondary">
            Connect with Zilobase to clip pages into a workspace. API keys remain available as an
            advanced option.
          </p>
        </div>
        <section className="grid gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel>Server URL</FieldLabel>
              <Input
                onChange={(event) => setInstanceUrl(event.target.value)}
                placeholder="https://app.example.com"
                value={instanceUrl}
              />
            </Field>
            <details className="grid gap-4">
              <summary className="cursor-pointer text-sm font-medium">Advanced: API key</summary>
              <Field>
                <FieldLabel>Workspace ID</FieldLabel>
                <Input
                  onChange={(event) => setWorkspaceId(event.target.value)}
                  value={workspaceId}
                />
              </Field>
              <Field>
                <FieldLabel>Workspace name</FieldLabel>
                <Input
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  value={workspaceName}
                />
              </Field>
              <Field>
                <FieldLabel>API key</FieldLabel>
                <Input
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="nl_…"
                  type="password"
                  value={token}
                />
                <FieldDescription>
                  Create a key in Settings → API Keys. It is stored only in this browser.
                </FieldDescription>
              </Field>
              <Button onClick={() => void save()} variant="outline">
                Save API key
              </Button>
            </details>
          </FieldGroup>
          <div className="flex gap-2">
            <Button onClick={() => void connectWithOAuth()}>Connect with Zilobase</Button>
            <Button onClick={() => void disconnect()} variant="outline">
              Disconnect
            </Button>
          </div>
          {status ? <p className="text-sm text-content-secondary">{status}</p> : null}
        </section>
      </div>
    </main>
  );
}
