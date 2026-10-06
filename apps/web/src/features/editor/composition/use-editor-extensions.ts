import { useMemo, useState, useRef } from "react";
import type { Content, Extensions } from "@tiptap/core";
import type { TableOfContentDataItem } from "@tiptap/extension-table-of-contents";
import { normalizeEditorContent } from "./create-base-extensions";
import { createBaseExtensions } from "./create-base-extensions";
import type { UseEditorExtensionsOptions } from "../core/types";

export type { UseEditorExtensionsOptions };

export const useEditorExtensions = ({
  collaboration,
  collaborationField,
  content,
  createEditorDatabase,
  createEditorMeeting,
  databaseEditorRuntime,
  structuralEditingEnabled,
  onCreatePage,
  onEmbedPage,
  onOpenPage,
  onStructuralInsertionPendingChange,
  workspaceId,
  pageId,
}: UseEditorExtensionsOptions) => {
  const [tocItems, setTocItems] = useState<TableOfContentDataItem[]>([]);

  const structural = useRef(structuralEditingEnabled);
  structural.current = structuralEditingEnabled;
  const latest = useRef({
    createEditorDatabase,
    createEditorMeeting,
    onCreatePage,
    onEmbedPage,
    onOpenPage,
    onStructuralInsertionPendingChange,
  });
  latest.current = {
    createEditorDatabase,
    createEditorMeeting,
    onCreatePage,
    onEmbedPage,
    onOpenPage,
    onStructuralInsertionPendingChange,
  };
  const document = collaboration?.document;
  const awareness = collaboration?.awareness ?? collaboration?.provider?.awareness;
  const editorExtensions = useMemo<Extensions>(
    () =>
      createBaseExtensions({
        collaboration,
        collaborationField,
        databaseEditorRuntime,
        editable: true,
        structuralEditingEnabled: true,
        isStructuralEditingEnabled: () => structural.current,
        createEditorDatabase: () => latest.current.createEditorDatabase(),
        createEditorMeeting: () => latest.current.createEditorMeeting(),
        onCreatePage: onCreatePage ? () => latest.current.onCreatePage!() : undefined,
        onEmbedPage: (id) => latest.current.onEmbedPage?.(id),
        onOpenPage: (id, options) => latest.current.onOpenPage?.(id, options),
        onStructuralInsertionPendingChange: (pending) =>
          latest.current.onStructuralInsertionPendingChange?.(pending),
        onTocUpdate: (items) => queueMicrotask(() => setTocItems(items)),
        workspaceId,
        pageId,
      }),
    [document, awareness, collaborationField, databaseEditorRuntime, workspaceId, pageId],
  );

  // Tiptap's Collaboration extension binds to one Y.XmlFragment when the
  // editor is created. Recreate the editor when a meeting switches between
  // notes, summary, and transcript. Page awareness exists before transport
  // startup; meeting awareness comes from its provider.
  const collaborationPresenceKey =
    (collaboration?.awareness || collaboration?.provider?.awareness) && collaboration.user
      ? "presence"
      : "content-only";
  const editorLifecycleKey = collaboration
    ? `${document?.guid ?? pageId ?? "collaboration"}:${collaborationField ?? "default"}:${collaborationPresenceKey}`
    : (pageId ?? "draft");
  const initialContent = collaboration ? undefined : (normalizeEditorContent(content) as Content);

  return {
    editorExtensions,
    editorLifecycleKey,
    initialContent,
    tocItems,
  };
};
