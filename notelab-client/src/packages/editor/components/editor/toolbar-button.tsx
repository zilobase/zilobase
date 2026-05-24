import { Button } from "@/components/ui/button"

import type { RunToolbarCommand, ToolbarItem } from "./types"

export function ToolbarButton({
  editor,
  item,
  runCommand,
  useMouseDown = false,
}: {
  editor: import("@tiptap/react").Editor | null
  item: ToolbarItem
  runCommand: RunToolbarCommand
  useMouseDown?: boolean
}) {
  const { action, attrs, icon: Icon, isActive, label } = item
  const activeValue = isActive()
  const isActiveButton =
    typeof activeValue === "string"
      ? editor?.isActive(activeValue)
      : editor?.isActive(activeValue)
  const handlePress = () => runCommand(action, attrs)

  return (
    <Button
      aria-label={label}
      disabled={!editor}
      onClick={useMouseDown ? undefined : handlePress}
      onMouseDown={
        useMouseDown
          ? (event) => {
              event.preventDefault()
              handlePress()
            }
          : undefined
      }
      size="icon"
      title={label}
      type="button"
      variant={isActiveButton ? "secondary" : "ghost"}
    >
      <Icon />
    </Button>
  )
}
