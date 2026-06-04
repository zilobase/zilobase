import { Redo2, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { EmojiPickerButton } from "@/packages/editor/extensions/emoji"

import { ColorMenu } from "./color-menu"
import { toolbarGroups } from "./toolbar-data"
import { ToolbarButton } from "./toolbar-button"
import type { EditorControlProps, RunToolbarCommand } from "./types"

export function EditorToolbar({
  editor,
  runCommand,
}: EditorControlProps & {
  runCommand: RunToolbarCommand
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/35 p-2">
      {toolbarGroups.map((group, groupIndex) => (
        <ButtonGroup key={groupIndex}>
          {group.map((item) => (
            <ToolbarButton
              editor={editor}
              item={item}
              key={item.label}
              runCommand={runCommand}
            />
          ))}
        </ButtonGroup>
      ))}
      <ButtonGroup>
        <ColorMenu editor={editor} />
        <EmojiPickerButton editor={editor} />
      </ButtonGroup>
      <div className="ml-auto flex items-center gap-1">
        <Button
          aria-label="Undo"
          disabled={!editor?.can().undo()}
          onClick={() => editor?.chain().focus().undo().run()}
          size="icon"
          title="Undo"
          type="button"
          variant="ghost"
        >
          <Undo2 />
        </Button>
        <Button
          aria-label="Redo"
          disabled={!editor?.can().redo()}
          onClick={() => editor?.chain().focus().redo().run()}
          size="icon"
          title="Redo"
          type="button"
          variant="ghost"
        >
          <Redo2 />
        </Button>
      </div>
    </div>
  )
}
