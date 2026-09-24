import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import type { ClipCaptureMode } from "@zilobase/features/clips";

import { Bookmark, SettingsIcon } from "@/shared/components/icons";
import { Button } from "@/shared/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Spinner } from "@/shared/ui/spinner";
import { createClip, openClippedPage } from "../../lib/api";
import type { ExtractResult } from "../../lib/messages";
import {
  readLastDestination,
  readSession,
  writeLastDestination,
  type ClipperDestination,
  type ClipperSession,
} from "../../lib/session";

const captureModes: Array<{ label: string; value: ClipCaptureMode }> = [
  { label: "Article", value: "article" },
  { label: "Selection", value: "selection" },
  { label: "Page", value: "page" },
  { label: "Bookmark", value: "bookmark" },
];

export function PopupApp() {
  const [session, setSession] = useState<ClipperSession | null>(null);
  const [instanceUrl, setInstanceUrl] = useState("");
  const [title, setTitle] = useState("");
  const [captureMode, setCaptureMode] = useState<ClipCaptureMode>("article");
  const [extracted, setExtracted] = useState<ExtractResult | null>(null);
  const [destination, setDestination] = useState<ClipperDestination | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const current = await readSession();
      setSession(current);
      if (current) setInstanceUrl(current.instanceUrl);
      setDestination(await readLastDestination());
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!session) return;
    void extract(captureMode);
  }, [session, captureMode]);

  const extract = async (mode: ClipCaptureMode) => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try {
      const result = (await browser.tabs.sendMessage(tab.id, {
        type: "EXTRACT",
        captureMode: mode,
      })) as ExtractResult;
      setExtracted(result);
      setTitle(result.metadata.title);
    } catch {
      setError("Reload this tab, then open the clipper again.");
    }
  };

  const connect = async () => {
    const origin = instanceUrl.trim().replace(/\/$/, "");
    if (!origin) {
      setError("Enter your Zilobase server URL.");
      return;
    }
    setError(null);
    await browser.storage.local.set({
      "clipper.pendingInstanceUrl": origin,
    });
    await browser.runtime.openOptionsPage();
  };

  const save = async () => {
    if (!session || !extracted) return;
    setSaving(true);
    setError(null);
    try {
      const result = await createClip(session, {
        workspaceId: session.workspaceId,
        title: title.trim() || extracted.metadata.title,
        sourceUrl: extracted.metadata.url,
        canonicalUrl: extracted.metadata.canonicalUrl,
        captureMode,
        html: captureMode === "bookmark" ? null : extracted.html,
        parentPageId: destinationId(destination, "page"),
        databaseId: destinationId(destination, "database"),
        metadata: {
          author: extracted.metadata.author,
          description: extracted.metadata.description,
          favicon: extracted.metadata.favicon,
          image: extracted.metadata.image,
          published: extracted.metadata.published,
          site: extracted.metadata.site,
        },
      });
      if (destination) await writeLastDestination(destination);
      setSavedUrl(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!ready) {
    return (
      <div className="flex h-40 items-center justify-center bg-surface-overlay">
        <Spinner />
      </div>
    );
  }

  if (!session?.token) {
    return (
      <div className="bg-surface-overlay p-4 text-content-primary">
        <Empty className="rounded-xl border-0 p-6">
          <EmptyHeader>
            <EmptyMedia>
              <Bookmark className="size-6" />
            </EmptyMedia>
            <EmptyTitle>Connect Zilobase</EmptyTitle>
            <EmptyDescription>
              Sign in on your instance so the clipper can save pages.
            </EmptyDescription>
          </EmptyHeader>
          <FieldGroup className="w-full gap-3">
            <Field>
              <FieldLabel>Server URL</FieldLabel>
              <Input
                onChange={(event) => setInstanceUrl(event.target.value)}
                placeholder="https://app.example.com"
                value={instanceUrl}
              />
            </Field>
            {error ? <FieldError>{error}</FieldError> : null}
            <Button className="w-full" onClick={() => void connect()}>
              Connect
            </Button>
          </FieldGroup>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 bg-surface-overlay p-4 text-xs/relaxed text-content-primary">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bookmark className="size-4" />
          <h1 className="font-heading text-sm font-medium">Save to Zilobase</h1>
        </div>
        <Button
          onClick={() => void browser.runtime.openOptionsPage()}
          size="icon-sm"
          variant="ghost"
        >
          <SettingsIcon />
        </Button>
      </header>

      <FieldGroup className="gap-3">
        <Field>
          <FieldLabel>Title</FieldLabel>
          <Input onChange={(event) => setTitle(event.target.value)} value={title} />
        </Field>
        <Field>
          <FieldLabel>Workspace</FieldLabel>
          <Input disabled value={session.workspaceName} />
        </Field>
        <Field>
          <FieldLabel>Capture</FieldLabel>
          <div className="grid grid-cols-4 gap-1">
            {captureModes.map((mode) => (
              <Button
                aria-pressed={captureMode === mode.value}
                disabled={selectionUnavailable(mode.value, extracted)}
                key={mode.value}
                onClick={() => setCaptureMode(mode.value)}
                size="sm"
                variant={captureMode === mode.value ? "secondary" : "outline"}
              >
                {mode.label}
              </Button>
            ))}
          </div>
        </Field>
      </FieldGroup>

      {error ? <FieldError>{error}</FieldError> : null}

      {savedUrl ? (
        <Button onClick={() => openClippedPage(session, savedUrl)} variant="link">
          Open in Zilobase
        </Button>
      ) : (
        <div className="flex justify-end gap-2">
          <Button onClick={() => window.close()} variant="outline">
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? <Spinner /> : null}
            {saving ? "Saving..." : "Save page"}
          </Button>
        </div>
      )}
    </div>
  );
}

function destinationId(destination: ClipperDestination | null, kind: ClipperDestination["kind"]) {
  return destination?.kind === kind ? destination.id : null;
}

function selectionUnavailable(mode: ClipCaptureMode, extracted: ExtractResult | null) {
  return mode === "selection" && !extracted?.selectionPresent;
}
