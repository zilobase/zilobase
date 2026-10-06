import { useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { useEditor } from "@tiptap/react";
import type { Content, Editor, Extensions } from "@tiptap/core";
import { Selection, TextSelection, type EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { toast } from "sonner";
import type { DatabaseBlockEditorRuntime } from "@/features/databases";
import { createEditorDragDrop, type BlockDragPayload } from "../drag-drop/block-drag";
import {
  getDropDatabaseElement,
  insertDraggedDatabasePage,
  isDraggingPageToEditor,
  shouldSkipEditorDropLine,
} from "../drag-drop/database-page-drag";
import {
  handleProviderLinkPaste,
  handleTypedLinkChoice,
  normalizePastedEditorHTML,
} from "../paste/paste";
import { EditorIntegration } from "./editor-integration";
import type { EditorWorkspace } from "./editor-workspace";
import type { BlockDropLine, PasteChoiceState } from "../core/types";
import type { OpenPageOptions } from "@/features/pages";
import { useLatestRef } from "./use-latest-ref";

import {
  handleProtectedStructuralBlockClipboardMutation,
  handleProtectedStructuralBlockDeleteKey,
} from "../paste/protected-structural-blocks";
import {
  handleBlockSelectionBeforeInput,
  handleBlockSelectionClipboardMutation,
  handleBlockSelectionKeyDown,
} from "../extensions/block-selection";

type UseEditorInstanceOptions = {
  workspace: EditorWorkspace;
  runtime: import("../core/types").EditorRuntimeHandle;
  documentKey: string;
  databaseEditorRuntime: DatabaseBlockEditorRuntime;
  dropPageOnDatabase: (event: DragEvent) => boolean;
  editable: boolean;
  editorContentRef?: MutableRefObject<(() => unknown) | null>;
  editorSurfaceRef?: RefObject<HTMLElement | null>;
  editorExtensions: Extensions;
  editorId: string;
  editorLifecycleKey: string;
  editorTabIndex?: number;
  initialContent: Content | undefined;
  onContentChange?: (
    readContent: () => unknown,
    transaction?: import("@tiptap/pm/state").Transaction,
  ) => void;
  onCrossEditorDatabaseDrop?: (input: { payload: BlockDragPayload; pos: number }) => boolean;
  onEditorReady?: (editor: Editor | null) => void;
  onEmbedPage?: import("../core/types").EditorResourceLink;
  onOpenPage?: (pageId: string, options?: OpenPageOptions) => void;
  onMoveToTitle?: () => boolean;
  setPasteChoice: (choice: PasteChoiceState | null) => void;
  pageId?: string | null;
};

function isCaretAtDocumentStart(state: EditorState) {
  const { doc, selection } = state;

  return (
    selection instanceof TextSelection &&
    selection.empty &&
    selection.from === Selection.atStart(doc).from
  );
}

function isClickAboveFirstNonTextBlock(view: EditorView, pos: number, event: MouseEvent) {
  const firstNode = view.state.doc.firstChild;

  if (pos !== 0 || !firstNode || firstNode.isTextblock) return false;

  const firstNodeDom = view.nodeDOM(0);

  return (
    firstNodeDom instanceof HTMLElement && event.clientY < firstNodeDom.getBoundingClientRect().top
  );
}

export const useEditorInstance = ({
  workspace,
  runtime,
  documentKey,
  dropPageOnDatabase,
  editable,
  editorContentRef,
  editorSurfaceRef,
  editorExtensions,
  editorId,
  editorLifecycleKey,
  editorTabIndex,
  initialContent,
  onContentChange,
  onCrossEditorDatabaseDrop,
  onEditorReady,
  onEmbedPage,
  onMoveToTitle,
  setPasteChoice,
  pageId,
}: UseEditorInstanceOptions) => {
  const [blockDropLine, setBlockDropLine] = useState<BlockDropLine | null>(null);
  const editorRef = useRef<Editor | null>(null);

  const onContentChangeRef = useLatestRef(onContentChange);
  const onCrossEditorDatabaseDropRef = useLatestRef(onCrossEditorDatabaseDrop);
  const onEmbedPageRef = useLatestRef(onEmbedPage);
  const onMoveToTitleRef = useLatestRef(onMoveToTitle);
  const editableRef = useLatestRef(editable);
  const dropPageOnDatabaseRef = useLatestRef(dropPageOnDatabase);
  const pageIdRef = useLatestRef(pageId);
  const handleProviderLinkPasteRef = useLatestRef(
    (view: Parameters<typeof handleProviderLinkPaste>[0], event: ClipboardEvent) =>
      handleProviderLinkPaste(view, event, editable, setPasteChoice),
  );
  const handleTypedLinkChoiceRef = useLatestRef(
    (view: Parameters<typeof handleTypedLinkChoice>[0], event: KeyboardEvent) =>
      handleTypedLinkChoice(view, event, editable, setPasteChoice),
  );

  const dragDrop = useMemo(
    () =>
      createEditorDragDrop(setBlockDropLine, {
        workspace,
        viewId: editorId,
        deferCrossEditorDatabaseDrop: (_view, payload, pos) =>
          payload.editorId !== editorId &&
          (onCrossEditorDatabaseDropRef.current?.({ payload, pos }) ?? false),
        dropPageOnDatabase: (event) => dropPageOnDatabaseRef.current(event),
        getView: () =>
          editorRef.current && !editorRef.current.isDestroyed ? editorRef.current.view : null,
        insertDraggedPage: (view, event) =>
          insertDraggedDatabasePage(
            view,
            event,
            (embeddedPageId) => onEmbedPageRef.current?.(embeddedPageId),
            pageIdRef.current,
            () => toast.error("You can't embed a page inside itself."),
            (error) =>
              toast.error(error instanceof Error ? error.message : "Could not embed page."),
          ),
        isDraggingPage: (event) => isDraggingPageToEditor(event, workspace),
        isOverDatabaseDrop: (event) => Boolean(getDropDatabaseElement(event)),
        shouldSkipDropLine: shouldSkipEditorDropLine,
        surfaceRef: editorSurfaceRef,
      }),
    [workspace, editorId, editorSurfaceRef],
  );

  const editor = useEditor(
    {
      extensions: [...editorExtensions, EditorIntegration.configure({ workspace })],
      immediatelyRender: false,
      content: initialContent,
      editable,
      // ProseMirror updates its own DOM. Keep transactions from rerendering the
      // entire React editor shell; controls subscribe to the editor directly.
      shouldRerenderOnTransaction: false,
      onCreate: ({ editor: currentEditor }) => {
        editorRef.current = currentEditor;
      },
      onUpdate: ({ editor: currentEditor, transaction }) => {
        if (editableRef.current)
          onContentChangeRef.current?.(() => currentEditor.getJSON(), transaction);
      },
      editorProps: {
        attributes: {
          class: "tiptap-editor",
          "aria-label": "Document editor",
          ...(editorTabIndex === undefined ? {} : { tabindex: String(editorTabIndex) }),
        },
        handleDrop: dragDrop.handleDrop,
        handleClick: (view, pos, event) => {
          if (!isClickAboveFirstNonTextBlock(view, pos, event)) return false;

          // StarterKit's gap cursor otherwise turns the editor padding above an
          // atomic first block into an invisible insertion point.
          event.preventDefault();
          view.dom.blur();
          return true;
        },
        handleDOMEvents: {
          ...dragDrop.domEvents,
          mousemove: (_view, event) =>
            event.target instanceof Element &&
            event.target.closest("[data-editor-view-id]")?.getAttribute("data-editor-view-id") !==
              editorId,
          beforeinput: (view, event) =>
            editableRef.current && handleBlockSelectionBeforeInput(view, event),
          keydown: (view, event) => {
            if (editableRef.current && handleBlockSelectionKeyDown(view, event)) {
              return true;
            }

            if (editableRef.current && handleProtectedStructuralBlockDeleteKey(view, event)) {
              return true;
            }

            if (event.key === "Enter") {
              return handleTypedLinkChoiceRef.current(view, event);
            }

            if (
              event.key === "Backspace" &&
              editableRef.current &&
              isCaretAtDocumentStart(view.state) &&
              onMoveToTitleRef.current?.()
            ) {
              event.preventDefault();
              return true;
            }

            return false;
          },
          cut: (view, event) =>
            editableRef.current &&
            (handleBlockSelectionClipboardMutation(view, event) ||
              handleProtectedStructuralBlockClipboardMutation(view, event)),
          keyup: (view, event) =>
            event.key === " " ? handleTypedLinkChoiceRef.current(view, event) : false,
        },
        handlePaste: (view, event) => {
          if (editableRef.current && handleBlockSelectionClipboardMutation(view, event)) {
            return true;
          }

          if (editableRef.current && handleProtectedStructuralBlockClipboardMutation(view, event)) {
            return true;
          }

          return handleProviderLinkPasteRef.current(view, event);
        },
        transformPastedHTML: normalizePastedEditorHTML,
      },
    },
    [editorLifecycleKey],
  );

  useEffect(() => {
    dragDrop.bind();
    return () => dragDrop.destroy();
  }, [dragDrop, editor]);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editorContentRef) return;
    editorContentRef.current = editor ? () => editor.getJSON() : null;
    return () => {
      editorContentRef.current = null;
    };
  }, [editor, editorContentRef]);

  useEffect(() => {
    onEditorReady?.(editor ?? null);
    return () => {
      onEditorReady?.(null);
    };
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(
      editable && (!workspace.views.has(editorId) || workspace.ownsField(editorId, documentKey)),
      false,
    );
  }, [editor, editable, workspace, editorId, documentKey]);

  useEffect(() => {
    if (!editor) return;
    let release: (() => void) | undefined;
    const register = () => {
      release ??= workspace.registerView(editorId, editor, documentKey, runtime);
    };
    editor.on("create", register);
    if (editor.isInitialized) register();
    return () => {
      editor.off("create", register);
      release?.();
    };
  }, [workspace, editor, editorId, documentKey, runtime]);

  return { blockDropLine, editor, surfaceDragHandlers: dragDrop.surfaceProps };
};
