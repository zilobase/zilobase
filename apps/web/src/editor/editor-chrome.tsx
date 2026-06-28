import type { Editor as TiptapEditor } from "@tiptap/react"
import type { TableOfContentDataItem } from "@tiptap/extension-table-of-contents"
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
  createEditorDatabase: () => Promise<string | null>
  dragHandle: DragHandleState | null
  editable: boolean
  editor: TiptapEditor | null
  editorId: string
  onClosePasteChoice: () => void
  onSelectionAiPreviewChange: (preview: SelectionAiDiffPreview | null) => void
  workspaceId?: string | null
  pasteChoice: PasteChoiceState | null
  plusMenuOpen: boolean
  setDragHandleMenuOpen: (open: boolean) => void
  setPlusMenuOpen: (open: boolean) => void
  tocItems: TableOfContentDataItem[]
}

export function EditorChrome({
  blockDropLine,
  createEditorDatabase,
  dragHandle,
  editable,
  editor,
  editorId,
  onClosePasteChoice,
  onSelectionAiPreviewChange,
  workspaceId,
  pasteChoice,
  plusMenuOpen,
  setDragHandleMenuOpen,
  setPlusMenuOpen,
  tocItems,
}: EditorChromeProps) {
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
      {blockDropLine ? (
        <div
          className="block-drag-drop-line"
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