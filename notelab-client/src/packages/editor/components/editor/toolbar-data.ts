import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CheckSquare,
  Code,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  ListCollapse,
  List,
  ListOrdered,
  Minus,
  Quote,
  Strikethrough,
  Table2,
  Underline,
} from "lucide-react"

import type { ColorToken, ToolbarItem } from "./types"

export const colorTokens: ColorToken[] = [
  {
    name: "Default",
    value: null,
    textClass: "text-foreground",
    backgroundClass: "bg-background",
  },
  {
    name: "Gray",
    value: "gray",
    textClass: "text-zinc-600 dark:text-zinc-300",
    backgroundClass: "bg-zinc-100 dark:bg-zinc-500/45",
  },
  {
    name: "Brown",
    value: "brown",
    textClass: "text-stone-700 dark:text-stone-300",
    backgroundClass: "bg-stone-200/70 dark:bg-stone-500/45",
  },
  {
    name: "Orange",
    value: "orange",
    textClass: "text-orange-600 dark:text-orange-300",
    backgroundClass: "bg-orange-100 dark:bg-orange-700/55",
  },
  {
    name: "Yellow",
    value: "yellow",
    textClass: "text-amber-700 dark:text-amber-300",
    backgroundClass: "bg-amber-100 dark:bg-amber-700/50",
  },
  {
    name: "Green",
    value: "green",
    textClass: "text-emerald-700 dark:text-emerald-300",
    backgroundClass: "bg-emerald-100 dark:bg-emerald-700/55",
  },
  {
    name: "Blue",
    value: "blue",
    textClass: "text-sky-700 dark:text-sky-300",
    backgroundClass: "bg-sky-100 dark:bg-sky-700/55",
  },
  {
    name: "Purple",
    value: "purple",
    textClass: "text-violet-700 dark:text-violet-300",
    backgroundClass: "bg-violet-100 dark:bg-violet-700/55",
  },
  {
    name: "Pink",
    value: "pink",
    textClass: "text-pink-700 dark:text-pink-300",
    backgroundClass: "bg-pink-100 dark:bg-pink-700/55",
  },
  {
    name: "Red",
    value: "red",
    textClass: "text-rose-700 dark:text-rose-300",
    backgroundClass: "bg-rose-100 dark:bg-rose-700/55",
  },
]

export const cyclingColorTokens = colorTokens.filter((token) => token.value)

export function getColorToken(color?: string | null) {
  if (!color || color === "default") {
    return colorTokens[0]
  }

  const normalizedColor = color.toLowerCase()

  return (
    colorTokens.find(
      (token) =>
        token.value === normalizedColor ||
        token.name.toLowerCase() === normalizedColor
    ) ?? colorTokens[0]
  )
}

export function getColorTokenValue(color?: string | null) {
  return getColorToken(color).value ?? "default"
}

export function getColorTokenBadgeClassName(color?: string | null) {
  return `database-select-badge ${getColorToken(color).backgroundClass}`
}

export function getColorTokenDotClassName(color?: string | null) {
  return `database-select-badge-dot ${getColorToken(color).textClass}`
}

export function getColorTokenBackgroundStyleValue(color?: string | null) {
  const token = getColorToken(color)

  return token.value ? `var(--editor-color-bg-${token.value})` : null
}

export function colorWithAlpha(color: string, alpha: number) {
  const tokenBackground = getColorTokenBackgroundStyleValue(color)

  if (tokenBackground) {
    return tokenBackground
  }

  if (!color.startsWith("#") || color.length !== 7) {
    return color
  }

  const normalizedAlpha = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0")

  return `${color}${normalizedAlpha}`
}

export const toolbarGroups: ToolbarItem[][] = [
  [
    {
      label: "Bold",
      icon: Bold,
      isActive: () => "bold",
      action: "toggleBold",
    },
    {
      label: "Italic",
      icon: Italic,
      isActive: () => "italic",
      action: "toggleItalic",
    },
    {
      label: "Strike",
      icon: Strikethrough,
      isActive: () => "strike",
      action: "toggleStrike",
    },
    {
      label: "Inline code",
      icon: Code,
      isActive: () => "code",
      action: "toggleCode",
    },
    {
      label: "Underline",
      icon: Underline,
      isActive: () => "underline",
      action: "toggleUnderline",
    },
  ],
  [
    {
      label: "Heading 1",
      icon: Heading1,
      isActive: () => ({ heading: { level: 1 } }),
      action: "toggleHeading",
      attrs: { level: 1 },
    },
    {
      label: "Heading 2",
      icon: Heading2,
      isActive: () => ({ heading: { level: 2 } }),
      action: "toggleHeading",
      attrs: { level: 2 },
    },
    {
      label: "Heading 3",
      icon: Heading3,
      isActive: () => ({ heading: { level: 3 } }),
      action: "toggleHeading",
      attrs: { level: 3 },
    },
    {
      label: "Bullet list",
      icon: List,
      isActive: () => "bulletList",
      action: "toggleBulletList",
    },
    {
      label: "Ordered list",
      icon: ListOrdered,
      isActive: () => "orderedList",
      action: "toggleOrderedList",
    },
    {
      label: "Task list",
      icon: CheckSquare,
      isActive: () => "taskList",
      action: "toggleTaskList",
    },
    {
      label: "Blockquote",
      icon: Quote,
      isActive: () => "blockquote",
      action: "toggleBlockquote",
    },
    {
      label: "Code block",
      icon: Code2,
      isActive: () => "codeBlock",
      action: "toggleCodeBlock",
    },
    {
      label: "Toggle",
      icon: ListCollapse,
      isActive: () => "details",
      action: "setDetails",
    },
    {
      label: "Divider",
      icon: Minus,
      isActive: () => ({ horizontalRule: true }),
      action: "setHorizontalRule",
    },
    {
      label: "Table",
      icon: Table2,
      isActive: () => "table",
      action: "insertTable",
    },
  ],
  [
    {
      label: "Align left",
      icon: AlignLeft,
      isActive: () => ({ textAlign: "left" }),
      action: "setTextAlign",
      attrs: { align: "left" },
    },
    {
      label: "Align center",
      icon: AlignCenter,
      isActive: () => ({ textAlign: "center" }),
      action: "setTextAlign",
      attrs: { align: "center" },
    },
    {
      label: "Align right",
      icon: AlignRight,
      isActive: () => ({ textAlign: "right" }),
      action: "setTextAlign",
      attrs: { align: "right" },
    },
  ],
]
