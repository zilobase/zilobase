import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import { useEditor } from "@tiptap/react";
import type { Content, Editor, Extensions } from "@tiptap/core";
import {
  Selection,
  TextSelection,
  type EditorState,
} from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { toast } from "sonner";
import type { DatabaseBlockEditorRuntime } from "@/packages/editor/extensions/database";
import {
  createEditorDragDrop,
  registerBlockDragSource,
  type BlockDragPayload,
} from "@/packages/editor/components/editor/block-drag";
import {
  getDropDatabaseElement,
  insertDraggedDatabasePage,
  isDraggingPageToEditor,
  shouldSkipEditorDropLine,
} from "./database-page-drag";
import {
  handleProviderLinkPaste,
  handleTypedLinkChoice,
  normalizePastedEditorHTML,
} from "./paste";
import { updateExtensionOptions } from "./update-extension-options";
import type { BlockDropLine, OpenPageOptions, PasteChoiceState } from "./types";
import { useLatestRef } from "./use-latest-ref";
import {
  closeEditorHistory,
  getEditorHistoryDepths,
  getEditorHistoryTransition,
  isEditorHistoryOperation,
  recordActiveUndoHistoryEditorTransition,
  registerEditorHistoryBoundary,
  type EditorHistoryDepths,
} from "@/shortcuts";
import {
  handleProtectedStructuralBlockClipboardMutation,
  handleProtectedStructuralBlockDeleteKey,
} from "./protected-structural-blocks";

type UseEditorInstanceOptions = {
  databaseEditorRuntime: DatabaseBlockEditorRuntime;
  dropPageOnDatabase: (event: DragEvent) => boolean;
  editable: boolean;
  editorContentRef?: MutableRefObject<(() => unknown) | null>;
  editorSurfaceRef?: RefObject<HTMLElement | null>;
  editorExtensions: Extensions;
  editorId: string;
  editorLifecycleKey: string;
  editorRuntimeRef: MutableRefObject<{
    editable: boolean;
    listeners: Set<() => void>;
  }>;
  initialContent: Content | undefined;
  onContentChange?: (content: unknown) => void;
  onCrossEditorDatabaseDrop?: (input: {
    payload: BlockDragPayload;
    pos: number;
  }) => boolean;
  onEditorReady?: (editor: Editor | null) => void;
  onEmbedPage?: (pageId: string) => void | Promise<void>;
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

function isClickAboveFirstNonTextBlock(
  view: EditorView,
  pos: number,
  event: MouseEvent,
) {
  const firstNode = view.state.doc.firstChild;

  if (pos !== 0 || !firstNode || firstNode.isTextblock) return false;

  const firstNodeDom = view.nodeDOM(0);

  return (
    firstNodeDom instanceof HTMLElement &&
    event.clientY < firstNodeDom.getBoundingClientRect().top
  );
}

export const useEditorInstance = ({
  databaseEditorRuntime,
  dropPageOnDatabase,
  editable,
  editorContentRef,
  editorSurfaceRef,
  editorExtensions,
  editorId,
  editorLifecycleKey,
  editorRuntimeRef,
  initialContent,
  onContentChange,
  onCrossEditorDatabaseDrop,
  onEditorReady,
  onEmbedPage,
  onOpenPage,
  onMoveToTitle,
  setPasteChoice,
  pageId,
}: UseEditorInstanceOptions) => {
  const [blockDropLine, setBlockDropLine] = useState<BlockDropLine | null>(
    null,
  );
  const editorRef = useRef<Editor | null>(null);
  const editorHistoryDepthsRef = useRef<EditorHistoryDepths>({
    redo: 0,
    undo: 0,
  });

  const onContentChangeRef = useLatestRef(onContentChange);
  const onCrossEditorDatabaseDropRef = useLatestRef(
    onCrossEditorDatabaseDrop,
  );
  const onEmbedPageRef = useLatestRef(onEmbedPage);
  const onMoveToTitleRef = useLatestRef(onMoveToTitle);
  const editableRef = useLatestRef(editable);
  const dropPageOnDatabaseRef = useLatestRef(dropPageOnDatabase);
  const pageIdRef = useLatestRef(pageId);
  const handleProviderLinkPasteRef = useLatestRef(
    (
      view: Parameters<typeof handleProviderLinkPaste>[0],
      event: ClipboardEvent,
    ) => handleProviderLinkPaste(view, event, editable, setPasteChoice),
  );
  const handleTypedLinkChoiceRef = useLatestRef(
    (view: Parameters<typeof handleTypedLinkChoice>[0], event: KeyboardEvent) =>
      handleTypedLinkChoice(view, event, editable, setPasteChoice),
  );

  const dragDrop = useMemo(
    () =>
      createEditorDragDrop(setBlockDropLine, {
        deferCrossEditorDatabaseDrop: (_view, payload, pos) =>
          payload.editorId !== editorId &&
          (onCrossEditorDatabaseDropRef.current?.({ payload, pos }) ?? false),
        dropPageOnDatabase: (event) => dropPageOnDatabaseRef.current(event),
        getView: () =>
          editorRef.current && !editorRef.current.isDestroyed
            ? editorRef.current.view
            : null,
        insertDraggedPage: (view, event) =>
          insertDraggedDatabasePage(
            view,
            event,
            (embeddedPageId) => onEmbedPageRef.current?.(embeddedPageId),
            pageIdRef.current,
            () => toast.error("You can't embed a page inside itself."),
          ),
        isDraggingPage: isDraggingPageToEditor,
        isOverDatabaseDrop: (event) => Boolean(getDropDatabaseElement(event)),
        shouldSkipDropLine: shouldSkipEditorDropLine,
        surfaceRef: editorSurfaceRef,
      }),
    [editorId, editorSurfaceRef],
  );

  const editor = useEditor(
    {
      extensions: editorExtensions,
      content: initialContent,
      editable,
      // ProseMirror updates its own DOM. Keep transactions from rerendering the
      // entire React editor shell; controls subscribe to the editor directly.
      shouldRerenderOnTransaction: false,
      onCreate: ({ editor: currentEditor }) => {
        editorRef.current = currentEditor;
        editorHistoryDepthsRef.current = getEditorHistoryDepths(currentEditor);
      },
      onTransaction: ({ editor: currentEditor, transaction }) => {
        const nextDepths = getEditorHistoryDepths(currentEditor);
        const transition = getEditorHistoryTransition(
          editorHistoryDepthsRef.current,
          nextDepths,
          isEditorHistoryOperation(currentEditor, transaction),
        );

        editorHistoryDepthsRef.current = nextDepths;

        if (!transition) return;

        recordActiveUndoHistoryEditorTransition({
          ...transition,
          label: "Edit page",
          owner: currentEditor,
          redo: () =>
            !currentEditor.isDestroyed && currentEditor.commands.redo(),
          undo: () =>
            !currentEditor.isDestroyed && currentEditor.commands.undo(),
        });
      },
      onUpdate: ({ editor: currentEditor }) => {
        if (editable) onContentChangeRef.current?.(currentEditor.getJSON());
      },
      editorProps: {
        attributes: { class: "tiptap-editor", "aria-label": "Document editor" },
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
          keydown: (view, event) => {
            if (
              editableRef.current &&
              handleProtectedStructuralBlockDeleteKey(view, event)
            ) {
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
            handleProtectedStructuralBlockClipboardMutation(view, event),
          keyup: (view, event) =>
            event.key === " "
              ? handleTypedLinkChoiceRef.current(view, event)
              : false,
        },
        handlePaste: (view, event) => {
          if (
            editableRef.current &&
            handleProtectedStructuralBlockClipboardMutation(view, event)
          ) {
            return true;
          }

          return handleProviderLinkPasteRef.current(view, event);
        },
        transformPastedHTML: normalizePastedEditorHTML,
      },
    },
    [editorLifecycleKey],
  );

  useEffect(() => () => dragDrop.destroy(), [dragDrop]);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    return registerEditorHistoryBoundary(() => closeEditorHistory(editor));
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
    if (!editor || editor.isDestroyed || !editor.extensionManager) return;
    updateExtensionOptions(editor, {
      databaseEditorRuntime,
      editable,
      editorRuntimeRef,
      onOpenPage,
      pageId,
    });
  }, [
    databaseEditorRuntime,
    editor,
    editable,
    editorRuntimeRef,
    onOpenPage,
    pageId,
  ]);

  useEffect(() => {
    if (!editor) return;
    return registerBlockDragSource(editorId, editor);
  }, [editor, editorId]);

  return { blockDropLine, editor, surfaceDragHandlers: dragDrop.surfaceProps };
};
