import type { NestedOptions, RuleContext } from "@tiptap/extension-drag-handle";
import DragHandle from "@tiptap/extension-drag-handle-react";
import { useEditorWorkspace } from "../runtime/page-editor-registry";
import type { DragHandleTarget } from "../toolbar/toolbar-contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import type { TableOfContentDataItem } from "@tiptap/extension-table-of-contents";
import type { PageCommentController } from "@/features/comments/index";
import { getBlockCommentHandleRect } from "../drag-drop/block-drag";
import { BlockCommentPopover } from "../selection/block-comment-popover";
import { ColumnControls } from "../toolbar/column-controls";
import { DragBlockMenu } from "../drag-drop/drag-block-menu";
import { SelectionBubbleMenu } from "../selection/selection-bubble-menu";
import { TableControls } from "../toolbar/table-controls";
import { EditorTableOfContents } from "./editor-table-of-contents";
import { PasteChoiceMenu } from "../paste/paste-choice-menu";
import { runToolbarCommand } from "../commands/run-toolbar-command";
import type {
  BlockDropLine,
  PasteChoiceState,
  SelectionAiDiffPreview,
  StructuralBlockDeleteAction,
  StructuralBlockDeleteHistory,
  StructuralBlockDeleteRequest,
} from "../core/types";
import type { StructuralInsertionPendingChange } from "../commands/structural-insertion";

type EditorChromeProps = {
  blockDropLine: BlockDropLine | null;
  blockCommentOpen: boolean;
  commentController?: PageCommentController;
  createEditorDatabase: () => Promise<string | null>;
  createEditorMeeting: () => Promise<string | null>;
  dragHandleMenuOpen: boolean;
  editable: boolean;
  editor: TiptapEditor | null;
  editorId: string;
  getStructuralBlockDeleteAction?: (
    request: StructuralBlockDeleteRequest,
  ) => StructuralBlockDeleteAction;
  onClosePasteChoice: () => void;
  onDeleteStructuralBlock?: (
    request: StructuralBlockDeleteRequest,
  ) => Promise<StructuralBlockDeleteHistory | void>;
  onSelectionAiPreviewChange: (preview: SelectionAiDiffPreview | null) => void;
  onStructuralInsertionPendingChange?: StructuralInsertionPendingChange;
  pageId?: string | null;
  workspaceId?: string | null;
  pasteChoice: PasteChoiceState | null;
  plusMenuOpen: boolean;
  setDragHandleMenuOpen: (open: boolean) => void;
  setBlockCommentOpen: (open: boolean) => void;
  setPlusMenuOpen: (open: boolean) => void;
  tocItems: TableOfContentDataItem[];
};

export function EditorChrome({
  blockDropLine,
  blockCommentOpen,
  commentController,
  createEditorDatabase,
  createEditorMeeting,
  dragHandleMenuOpen,
  editable,
  editor,
  editorId,
  getStructuralBlockDeleteAction,
  onClosePasteChoice,
  onDeleteStructuralBlock,
  onSelectionAiPreviewChange,
  onStructuralInsertionPendingChange,
  pageId,
  workspaceId,
  pasteChoice,
  plusMenuOpen,
  setDragHandleMenuOpen,
  setBlockCommentOpen,
  setPlusMenuOpen,
  tocItems,
}: EditorChromeProps) {
  const [mountedEditor, setMountedEditor] = useState<TiptapEditor | null>(null);
  useEffect(() => {
    if (!editor) return;
    const mounted = () => setMountedEditor(editor);
    const unmounted = () => setMountedEditor(null);
    editor.on("mount", mounted);
    editor.on("create", mounted);
    editor.on("unmount", unmounted);
    editor.on("destroy", unmounted);
    if (editor.isInitialized && !editor.isDestroyed) mounted();
    return () => {
      editor.off("mount", mounted);
      editor.off("create", mounted);
      editor.off("unmount", unmounted);
      editor.off("destroy", unmounted);
    };
  }, [editor]);
  if (!editor || mountedEditor !== editor || !editor.isInitialized || editor.isDestroyed)
    return null;

  return (
    <>
      {editable ? (
        <EditorBlockHandle
          {...{
            editor,
            editorId,
            blockCommentOpen,
            commentController,
            createEditorDatabase,
            createEditorMeeting,
            dragHandleMenuOpen,
            getStructuralBlockDeleteAction,
            onDeleteStructuralBlock,
            onStructuralInsertionPendingChange,
            pageId,
            plusMenuOpen,
            setDragHandleMenuOpen,
            setBlockCommentOpen,
            setPlusMenuOpen,
          }}
        />
      ) : null}
      {editable && blockDropLine ? (
        <div
          aria-hidden="true"
          className="drag-drop-line block-drag-drop-line"
          data-orientation="horizontal"
          style={{
            left: blockDropLine.left,
            top: blockDropLine.top,
            width: Math.max(0, blockDropLine.right - blockDropLine.left),
          }}
        />
      ) : null}
      {editable ? (
        <>
          <SelectionBubbleMenu
            editor={editor}
            onSelectionAiPreviewChange={onSelectionAiPreviewChange}
            workspaceId={workspaceId}
            runCommand={(action, attrs) => runToolbarCommand(editor, action, attrs)}
          />
          <ColumnControls editor={editor} />
          <TableControls editor={editor} />
        </>
      ) : null}
      <EditorTableOfContents editor={editor} items={tocItems} />
      {pasteChoice && editor ? (
        <PasteChoiceMenu editor={editor} pasteChoice={pasteChoice} onClose={onClosePasteChoice} />
      ) : null}
    </>
  );
}

// The official React handle initializes its element with absolute positioning.
// Match that strategy so the first calculation uses the pane's coordinate space,
// and scrolling moves the handle together with its block.
const HANDLE_POSITION = { placement: "left-start" as const, strategy: "absolute" as const };
const NESTED_HANDLE: NestedOptions = {
  edgeDetection: "none",
  allowedContainers: [
    "doc",
    "bulletList",
    "orderedList",
    "taskList",
    "blockquote",
    "detailsContent",
    "column",
  ],
  rules: [
    {
      id: "excludeStructuralContainers",
      evaluate: ({ node, $pos, depth }: RuleContext) => {
        if (
          [
            "column",
            "detailsContent",
            "detailsSummary",
            "tableRow",
            "tableCell",
            "tableHeader",
          ].includes(node.type.name)
        )
          return 1000;
        if (node.type.name !== "table")
          for (let ancestor = 1; ancestor <= Math.min(depth, $pos.depth); ancestor++) {
            if ($pos.node(ancestor).type.name === "table") return 1000;
          }
        return 0;
      },
    },
  ],
};
function EditorBlockHandle(
  props: Pick<
    EditorChromeProps,
    | "editorId"
    | "blockCommentOpen"
    | "commentController"
    | "createEditorDatabase"
    | "createEditorMeeting"
    | "dragHandleMenuOpen"
    | "getStructuralBlockDeleteAction"
    | "onDeleteStructuralBlock"
    | "onStructuralInsertionPendingChange"
    | "pageId"
    | "plusMenuOpen"
    | "setDragHandleMenuOpen"
    | "setBlockCommentOpen"
    | "setPlusMenuOpen"
  > & { editor: TiptapEditor },
) {
  const { editor, editorId } = props;
  const workspace = useEditorWorkspace();
  const targetRef = useRef<DragHandleTarget | null>(null);
  const nativeDraggingRef = useRef(false);
  const [target, setTarget] = useState<DragHandleTarget | null>(null);
  const getHandleReference = useCallback(() => {
    const current = targetRef.current;
    if (!current || editor.isDestroyed) return null;
    const dom = editor.view.nodeDOM(current.pos);
    if (!(dom instanceof HTMLElement)) return null;
    // Target padded text, and the first line of a list item, rather than the
    // enclosing box. Resource blocks align with their header controls.
    const header = dom.querySelector<HTMLElement>(".database-toolbar");
    const firstLine = dom.matches("li, blockquote")
      ? dom.querySelector<HTMLElement>(":scope > p")
      : null;
    const headerLine =
      header?.firstElementChild instanceof HTMLElement ? header.firstElementChild : header;
    const vertical = headerLine ?? firstLine ?? dom;
    const horizontal = header?.closest<HTMLElement>(".database-toolbar-section") ?? dom;
    return {
      contextElement: dom,
      getBoundingClientRect: () => {
        const rect = horizontal.getBoundingClientRect();
        const verticalRect = vertical.getBoundingClientRect();
        const style = getComputedStyle(vertical);
        const leftPadding = parseFloat(getComputedStyle(horizontal).paddingLeft) || 0;
        const topPadding = parseFloat(style.paddingTop) || 0;
        const lineHeight = header ? verticalRect.height : parseFloat(style.lineHeight) || 28;
        const markerGap = current.node.type.name === "listItem" ? 12 : 0;
        return DOMRect.fromRect({
          x: rect.left + leftPadding - markerGap,
          y: verticalRect.top + topPadding + (lineHeight - 28) / 2,
          width: rect.width - leftPadding,
          height: 28,
        });
      },
    };
  }, [editor]);
  const onNodeChange = useCallback(
    ({ node, pos }: { node: import("@tiptap/pm/model").Node | null; pos: number }) => {
      targetRef.current = node ? { node, pos } : null;
      const next = targetRef.current;
      queueMicrotask(() =>
        setTarget((previous) =>
          previous?.node === next?.node && previous?.pos === next?.pos ? previous : next,
        ),
      );
    },
    [],
  );
  const onDragStart = useCallback(
    (event: DragEvent) => {
      nativeDraggingRef.current = true;
      if (
        !targetRef.current ||
        (workspace.drag.active?.editor !== editor &&
          !workspace.drag.arm(editorId, targetRef.current))
      )
        event.preventDefault();
    },
    [workspace, editorId],
  );
  const onDragEnd = useCallback(() => workspace.drag.endNative(), [workspace]);
  useEffect(() => {
    // useEditor can replace this instance in a parent effect before React
    // reconnects this child's effects during development or a document change.
    if (editor.isDestroyed || !editor.isInitialized) return;
    editor.commands.setMeta("lockDragHandle", props.dragHandleMenuOpen);
  }, [editor, props.dragHandleMenuOpen]);
  const commentPosition = target ? getBlockCommentHandleRect(editor.view, target) : null;
  return (
    <>
      <DragHandle
        editor={editor}
        nested={NESTED_HANDLE}
        computePositionConfig={HANDLE_POSITION}
        getReferencedVirtualElement={getHandleReference}
        onNodeChange={onNodeChange}
        onElementDragStart={onDragStart}
        onElementDragEnd={onDragEnd}
      >
        <div
          className="contents"
          onPointerDownCapture={(event) => {
            if (
              event.button === 0 &&
              event.target instanceof Element &&
              event.target.closest('[aria-label="Open block actions"]') &&
              targetRef.current
            ) {
              nativeDraggingRef.current = false;
              workspace.drag.arm(editorId, targetRef.current);
            }
          }}
          onPointerUpCapture={() => {
            if (!nativeDraggingRef.current) workspace.drag.reset();
          }}
        >
          <DragBlockMenu
            editor={editor}
            isOpen={props.plusMenuOpen}
            target={target}
            onOpenChange={props.setPlusMenuOpen}
            onMenuStateChange={props.setDragHandleMenuOpen}
            onCreateDatabase={props.createEditorDatabase}
            onCreateMeeting={props.createEditorMeeting}
            onDeleteStructuralBlock={props.onDeleteStructuralBlock}
            getStructuralBlockDeleteAction={props.getStructuralBlockDeleteAction}
            onStructuralInsertionPendingChange={props.onStructuralInsertionPendingChange}
          />
        </div>
      </DragHandle>
      {target && commentPosition && props.commentController && props.pageId ? (
        <div
          className="block-comment-handle"
          style={{ left: commentPosition.left, top: commentPosition.top }}
        >
          <BlockCommentPopover
            commentController={props.commentController}
            editor={editor}
            onOpenChange={props.setBlockCommentOpen}
            open={props.blockCommentOpen}
            pageId={props.pageId}
            target={target}
          />
        </div>
      ) : null}
    </>
  );
}
