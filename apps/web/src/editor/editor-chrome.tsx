import type { Editor as TiptapEditor } from "@tiptap/react"
import type { TableOfContentDataItem } from "@tiptap/extension-table-of-contents"
import type { PageCommentController } from "@/comments/yjs-comments"
import { getBlockCommentHandleRect } from "@/packages/editor/components/editor/block-drag"
import { BlockCommentPopover } from "@/packages/editor/components/editor/block-comment-popover"
import { ColumnControls } from "@/packages/editor/components/editor/column-controls"
import { DragBlockMenu } from "@/packages/editor/components/editor/drag-block-menu"
import { SelectionBubbleMenu } from "@/packages/editor/components/editor/selection-bubble-menu"
import { TableControls } from "@/packages/editor/components/editor/table-controls"
import { EditorTableOfContents } from "./editor-table-of-contents"
import { PasteChoiceMenu } from "./paste-choice-menu"
import { runToolbarCommand } from "./run-toolbar-command"
import type {
  BlockDropLine,
  DragHandleState,
  PasteChoiceState,
  SelectionAiDiffPreview,
} from "./types"

type EditorChromeProps = {
  blockDropLine: BlockDropLine | null
  blockCommentOpen: boolean
  commentController?: PageCommentController
  createEditorDatabase: () => Promise<string | null>
  dragHandle: DragHandleState | null
  editable: boolean
  editor: TiptapEditor | null
  editorId: string
  onClosePasteChoice: () => void
  onSelectionAiPreviewChange: (preview: SelectionAiDiffPreview | null) => void
  pageId?: string | null
  workspaceId?: string | null
  pasteChoice: PasteChoiceState | null
  plusMenuOpen: boolean
  setDragHandleMenuOpen: (open: boolean) => void
  setBlockCommentOpen: (open: boolean) => void
  setPlusMenuOpen: (open: boolean) => void
  tocItems: TableOfContentDataItem[]
}

export function EditorChrome({
  blockDropLine,
  blockCommentOpen,
  commentController,
  createEditorDatabase,
  dragHandle,
  editable,
  editor,
  editorId,
  onClosePasteChoice,
  onSelectionAiPreviewChange,
  pageId,
  workspaceId,
  pasteChoice,
  plusMenuOpen,
  setDragHandleMenuOpen,
  setBlockCommentOpen,
  setPlusMenuOpen,
  tocItems,
}: EditorChromeProps) {
  const blockCommentPosition = editor && dragHandle
    ? getBlockCommentHandleRect(editor.view, dragHandle.target)
    : null

  return (
    <>
      {editable && editor && dragHandle ? (
        <div
          className="drag-handle"
          style={{
            left: dragHandle.position.left,
            top: dragHandle.position.top,
          }}
        >
          <DragBlockMenu
            editor={editor}
            editorId={editorId}
            isOpen={plusMenuOpen}
            onMenuStateChange={setDragHandleMenuOpen}
            onCreateDatabase={createEditorDatabase}
            onOpenChange={setPlusMenuOpen}
            target={dragHandle.target}
          />
        </div>
      ) : null}
      {editable &&
      editor &&
      dragHandle &&
      blockCommentPosition &&
      commentController &&
      pageId ? (
        <div
          className="block-comment-handle"
          style={{
            left: blockCommentPosition.left,
            top: blockCommentPosition.top,
          }}
        >
          <BlockCommentPopover
            commentController={commentController}
            editor={editor}
            onOpenChange={setBlockCommentOpen}
            open={blockCommentOpen}
            pageId={pageId}
            target={dragHandle.target}
          />
        </div>
      ) : null}
      {blockDropLine ? (
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
            runCommand={(action, attrs) =>
              runToolbarCommand(editor, action, attrs)
            }
          />
          <ColumnControls editor={editor} />
          <TableControls editor={editor} />
        </>
      ) : null}
      <EditorTableOfContents editor={editor} items={tocItems} />
      {pasteChoice && editor ? (
        <PasteChoiceMenu
          editor={editor}
          pasteChoice={pasteChoice}
          onClose={onClosePasteChoice}
        />
      ) : null}
    </>
  )
}
