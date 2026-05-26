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
    textClass: "text-[#37352F] dark:text-white/90",
    backgroundClass: "bg-white dark:bg-[#2F3437]",
  },
  {
    name: "Gray",
    value: "#9B9A97",
    textClass: "text-[#9B9A97] dark:text-[rgba(151,154,155,0.95)]",
    backgroundClass: "bg-[#EBECED] dark:bg-[#454B4E]",
  },
  {
    name: "Brown",
    value: "#64473A",
    textClass: "text-[#64473A] dark:text-[#937264]",
    backgroundClass: "bg-[#E9E5E3] dark:bg-[#434040]",
  },
  {
    name: "Orange",
    value: "#D9730D",
    textClass: "text-[#D9730D] dark:text-[#FFA344]",
    backgroundClass: "bg-[#FAEBDD] dark:bg-[#594A3A]",
  },
  {
    name: "Yellow",
    value: "#DFAB01",
    textClass: "text-[#DFAB01] dark:text-[#FFDC49]",
    backgroundClass: "bg-[#FBF3DB] dark:bg-[#59563B]",
  },
  {
    name: "Green",
    value: "#0F7B6C",
    textClass: "text-[#0F7B6C] dark:text-[#4DAB9A]",
    backgroundClass: "bg-[#DDEDEA] dark:bg-[#354C4B]",
  },
  {
    name: "Blue",
    value: "#0B6E99",
    textClass: "text-[#0B6E99] dark:text-[#529CCA]",
    backgroundClass: "bg-[#DDEBF1] dark:bg-[#364954]",
  },
  {
    name: "Purple",
    value: "#6940A5",
    textClass: "text-[#6940A5] dark:text-[#9A6DD7]",
    backgroundClass: "bg-[#EAE4F2] dark:bg-[#443F57]",
  },
  {
    name: "Pink",
    value: "#AD1A72",
    textClass: "text-[#AD1A72] dark:text-[#E255A1]",
    backgroundClass: "bg-[#F4DFEB] dark:bg-[#533B4C]",
  },
  {
    name: "Red",
    value: "#E03E3E",
    textClass: "text-[#E03E3E] dark:text-[#FF7369]",
    backgroundClass: "bg-[#FBE4E4] dark:bg-[#594141]",
  },
]

export const cyclingColorTokens = colorTokens.filter((token) => token.value)

const legacyColorAliases: Record<string, string> = {
  "#337ea9": "#0B6E99",
  "#448361": "#0F7B6C",
  "#9065b0": "#6940A5",
  "#a18072": "#64473A",
  "#c14c8a": "#AD1A72",
  "#cb912f": "#DFAB01",
  "#d44c47": "#E03E3E",
  "#d9730d": "#D9730D",
  "#78716c": "#9B9A97",
}

export function getColorToken(color?: string | null) {
  if (!color || color === "default") {
    return colorTokens[0]
  }

  const normalizedColor = color.toLowerCase()
  const aliasedColor = legacyColorAliases[normalizedColor] ?? color

  return (
    colorTokens.find(
      (token) =>
        token.value?.toLowerCase() === aliasedColor.toLowerCase() ||
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

export function colorWithAlpha(color: string, alpha: number) {
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
