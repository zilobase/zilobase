import { useAppShortcut } from "@/shared/shortcuts/shortcut-provider";
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";

import { createDocumentSessionRegistry } from "../collaboration/document-session-registry";
import type { PageDocumentSession } from "../collaboration/page-document-session";
import { createEditorWorkspace } from "./editor-workspace";

import type { PageEditPreviewClearOptions, PageEditPreviewRequest } from "../core/types";

export type PageEditorHandle = {
  focus?: () => void;
  paneId?: string;
  viewId?: string;
  acceptEditDiffPreview: () => boolean;
  clearEditDiffPreview: (options?: PageEditPreviewClearOptions) => void;
  getActiveEditDiffToolCallId: () => string | null;
  getContentJson: () => unknown | null;
  isEditDiffPreviewActive: () => boolean;
  isEditable: () => boolean;
  isSynchronized: () => boolean;
  setContentFromMarkdown: (markdown: string) => boolean;
  setContentJson: (content: unknown) => boolean;
  showEditDiffPreview: (request: PageEditPreviewRequest) => boolean;
};

export type { PageEditPreviewClearOptions, PageEditPreviewRequest };

type PageEditorRegistryValue = {
  getEditorHandle: (pageId: string) => PageEditorHandle | null;
  registerEditor: (pageId: string, handle: PageEditorHandle) => () => void;
  documentSessions: ReturnType<typeof createDocumentSessionRegistry<PageDocumentSession>>;
  workspace: ReturnType<typeof createEditorWorkspace>;
  subscribe: (listener: () => void) => () => void;
  getVersion: () => number;
};
const PageEditorRegistryContext = createContext<PageEditorRegistryValue | null>(null);
export function usePageEditorRegistryVersion() {
  const registry = usePageEditorRegistry();
  return useSyncExternalStore(registry.subscribe, registry.getVersion, registry.getVersion);
}
export function PageEditorRegistryProvider({ children }: { children: ReactNode }) {
  const registry = useMemo<PageEditorRegistryValue>(() => {
    const editors = new Map<string, { token: symbol; handle: PageEditorHandle }>();
    const listeners = new Set<() => void>();
    let version = 0;
    const publish = () => {
      version++;
      for (const listener of listeners) listener();
    };
    return {
      workspace: createEditorWorkspace(),
      documentSessions: createDocumentSessionRegistry<PageDocumentSession>(),
      getEditorHandle: (pageId) => editors.get(pageId)?.handle ?? null,
      registerEditor(pageId, handle) {
        const token = Symbol(pageId);
        editors.set(pageId, { token, handle });
        publish();
        return () => {
          if (editors.get(pageId)?.token !== token) return;
          editors.delete(pageId);
          publish();
        };
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      getVersion: () => version,
    };
  }, []);
  const useWorkspaceHistory = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.matches("input, textarea, select") || target.closest(".database-block"))
      return false;
    if (target.isContentEditable && !target.closest(".tiptap-editor")) return false;
    return true;
  };
  useAppShortcut(
    "undo",
    (event) => useWorkspaceHistory(event.target) && registry.workspace.history.undo(),
    { allowInEditable: true, priority: 110 },
  );
  useAppShortcut(
    "redo",
    (event) => useWorkspaceHistory(event.target) && registry.workspace.history.redo(),
    { allowInEditable: true, priority: 110 },
  );
  return (
    <PageEditorRegistryContext.Provider value={registry}>
      {children}
    </PageEditorRegistryContext.Provider>
  );
}
export function usePageEditorRegistry() {
  const value = useContext(PageEditorRegistryContext);
  if (!value)
    throw new Error("usePageEditorRegistry must be used inside a page editor registry provider");
  return value;
}
export function useEditorWorkspace() {
  return usePageEditorRegistry().workspace;
}
