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
    textClass: "text-foreground",
    backgroundClass: "bg-background",
  },
  {
    name: "Gray",
    value: "#78716c",
    textClass: "text-stone-500",
    backgroundClass: "bg-stone-500/20",
  },
  {
    name: "Brown",
    value: "#a18072",
    textClass: "text-[#a18072]",
    backgroundClass: "bg-[#a18072]/25",
  },
  {
    name: "Orange",
    value: "#d9730d",
    textClass: "text-orange-500",
    backgroundClass: "bg-orange-500/25",
  },
  {
    name: "Yellow",
    value: "#cb912f",
    textClass: "text-yellow-600",
    backgroundClass: "bg-yellow-500/25",
  },
  {
    name: "Green",
    value: "#448361",
    textClass: "text-emerald-600",
    backgroundClass: "bg-emerald-500/25",
  },
  {
    name: "Blue",
    value: "#337ea9",
    textClass: "text-blue-500",
    backgroundClass: "bg-blue-500/25",
  },
  {
    name: "Purple",
    value: "#9065b0",
    textClass: "text-purple-500",
    backgroundClass: "bg-purple-500/25",
  },
  {
    name: "Pink",
    value: "#c14c8a",
    textClass: "text-pink-500",
    backgroundClass: "bg-pink-500/25",
  },
  {
    name: "Red",
    value: "#d44c47",
    textClass: "text-red-500",
    backgroundClass: "bg-red-500/25",
  },
]

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
