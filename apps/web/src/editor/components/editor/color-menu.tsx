import { Palette } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import {
  colorTokens,
  colorWithAlpha,
  getPaletteColor,
  isPaletteColorActive,
} from "@/lib/color-tokens"
import type { ColorToken, EditorControlProps } from "./types"

function ColorSwatch({
  token,
  variant,
}: {
  token: ColorToken
  variant: "text" | "background"
}) {
  const textClass = token.textClass

  return (
    <span
      className={`flex size-6 shrink-0 items-center justify-center rounded-md border ${variant === "text" ? "bg-card" : token.backgroundClass}`}
    >
      {variant === "text" ? (
        <span className={`text-base font-semibold ${textClass}`}>A</span>
      ) : null}
    </span>
  )
}

type ColorPickerProps = {
  backgroundColor: string | null | undefined
  onBackgroundColorSelect: (color: string | null) => void
  onTextColorSelect: (color: string | null) => void
  textColor: string | null | undefined
}

function isBackgroundColorActive(
  stored: string | null | undefined,
  tokenValue: string | null,
) {
  if (!tokenValue) {
    return stored === null
  }

  return (
    stored === tokenValue || stored === colorWithAlpha(tokenValue, 0.18)
  )
}

function isTextColorActive(
  stored: string | null | undefined,
  tokenValue: string | null,
) {
  if (!tokenValue) {
    return stored === null
  }

  return isPaletteColorActive(stored, tokenValue)
}

export function ColorPicker({
  backgroundColor,
  onBackgroundColorSelect,
  onTextColorSelect,
  textColor,
}: ColorPickerProps) {
  return (
    <>
      <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
        Text color
      </div>
      <div className="grid gap-1">
        {colorTokens.map((token) => (
          <button
            className="flex min-h-8 items-center gap-2 rounded-md px-2 py-1 text-left text-xs outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
            key={`text-${token.name}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onTextColorSelect(token.value)}
            type="button"
          >
            <ColorSwatch token={token} variant="text" />
            <span>{token.name} text</span>
            {isTextColorActive(textColor, token.value) ? (
              <span className="ml-auto text-xs text-muted-foreground">
                Selected
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="my-1 h-px bg-border" />
      <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
        Background color
      </div>
      <div className="grid gap-1">
        {colorTokens.map((token) => (
          <button
            className="flex min-h-8 items-center gap-2 rounded-md px-2 py-1 text-left text-xs outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
            key={`background-${token.name}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onBackgroundColorSelect(token.value)}
            type="button"
          >
            <ColorSwatch token={token} variant="background" />
            <span>{token.name} background</span>
            {isBackgroundColorActive(backgroundColor, token.value) ? (
              <span className="ml-auto text-xs text-muted-foreground">
                Selected
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </>
  )
}

export function ColorMenu({ editor }: EditorControlProps) {
  const textColor = editor?.getAttributes("textStyle").color ?? null
  const backgroundColor =
    editor?.getAttributes("textStyle").backgroundColor ?? null

  const applyTextColor = (color: string | null) => {
    if (!editor) {
      return
    }

    if (color) {
      editor
        .chain()
        .focus()
        .unsetBackgroundColor()
        .setColor(getPaletteColor(color)!)
        .run()
      return
    }

    editor.chain().focus().unsetColor().unsetBackgroundColor().run()
  }

  const applyBackgroundColor = (color: string | null) => {
    if (!editor) {
      return
    }

    if (color) {
      editor
        .chain()
        .focus()
        .unsetColor()
        .setBackgroundColor(colorWithAlpha(color, 0.18)!)
        .run()
      return
    }

    editor.chain().focus().unsetColor().unsetBackgroundColor().run()
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label="Text and background color"
          disabled={!editor}
          size="icon"
          title="Text and background color"
          type="button"
          variant="ghost"
          onMouseDown={(event) => event.preventDefault()}
        >
          <Palette />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        avoidCollisions
        className="max-h-[var(--radix-popover-content-available-height)] w-64 gap-2 overflow-y-auto p-2"
        collisionPadding={8}
        side="bottom"
        sideOffset={6}
      >
        <ColorPicker
          backgroundColor={backgroundColor}
          onBackgroundColorSelect={applyBackgroundColor}
          onTextColorSelect={applyTextColor}
          textColor={textColor}
        />
      </PopoverContent>
    </Popover>
  )
}
