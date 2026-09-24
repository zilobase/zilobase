import type { Content, Editor } from "@tiptap/core";
import type { MutableRefObject } from "react";
import type { PageEditorHandle } from "./page-editor-registry";
import type { PageEditPreviewControls } from "../core/types";
import { parseMarkdownContent } from "../commands/editor-ai-utils";

export function createPageEditorHandle(input: {
  editable: boolean;
  getEditor: () => Editor | null;
  isSynchronized?: () => boolean;
  onContentChange?: (content: unknown) => void;
  pageEditPreviewRef?: MutableRefObject<PageEditPreviewControls | null>;
}): PageEditorHandle {
  const applyContent = (content: unknown) => {
    const editor = input.getEditor();

    if (!editor || !input.editable) {
      return false;
    }

    editor.commands.setContent(content as Content);
    input.onContentChange?.(editor.getJSON());
    return true;
  };

  const getPreviewControls = () => input.pageEditPreviewRef?.current ?? null;

  return {
    acceptEditDiffPreview: () => getPreviewControls()?.accept() ?? false,
    clearEditDiffPreview: (options) => {
      getPreviewControls()?.clear(options);
    },
    getActiveEditDiffToolCallId: () => getPreviewControls()?.toolCallId() ?? null,
    getContentJson: () => input.getEditor()?.getJSON() ?? null,
    isEditDiffPreviewActive: () => getPreviewControls()?.isActive() ?? false,
    isEditable: () => input.editable,
    isSynchronized: () => input.isSynchronized?.() ?? true,
    setContentFromMarkdown: (markdown) => {
      const editor = input.getEditor();

      if (!editor || !input.editable) {
        return false;
      }

      const parsed = parseMarkdownContent(editor, markdown, {
        unwrapPlainFencedBlock: true,
      });

      if (!parsed) {
        return false;
      }

      return applyContent({
        type: "doc",
        content: parsed.content,
      });
    },
    setContentJson: (content) => applyContent(content),
    showEditDiffPreview: (request) => getPreviewControls()?.show(request) ?? false,
  };
}
