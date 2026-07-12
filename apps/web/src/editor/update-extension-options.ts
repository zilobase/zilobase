import type { MutableRefObject } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import type { DatabaseBlockEditorRuntime } from "@/packages/editor/extensions/database";

export const updateExtensionOptions = (
  editor: TiptapEditor,
  options: {
    databaseEditorRuntime: DatabaseBlockEditorRuntime;
    editable: boolean;
    editorRuntimeRef: MutableRefObject<{
      editable: boolean;
      listeners: Set<() => void>;
    }>;
    onOpenPage?: (pageId: string) => void;
    pageId?: string | null;
  },
) => {
  for (const extension of editor.extensionManager.extensions) {
    if (extension.name === "databaseBlock") {
      extension.options.currentPageId = options.pageId;
      extension.options.editable = options.editable;
      extension.options.editorRuntime = options.databaseEditorRuntime;
      extension.options.onOpenPage = options.onOpenPage;
    }
    if (extension.name === "taskItem") {
      extension.options.editable = options.editable;
    }
    if (extension.name === "pageBlock") {
      extension.options.currentPageId = options.pageId;
      extension.options.onOpenPage = options.onOpenPage;
    }
    if (extension.name === "slashCommand") {
      extension.options.onOpenPage = options.onOpenPage;
    }
  }

  editor.setEditable(options.editable);
  options.editorRuntimeRef.current.editable = options.editable;
  options.editorRuntimeRef.current.listeners.forEach((listener) => listener());
};
