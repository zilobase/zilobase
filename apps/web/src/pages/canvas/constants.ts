import type { LucideIcon } from "lucide-react"
import {
  ArrowRightIcon,
  CircleIcon,
  DiamondIcon,
  SquareIcon,
} from "lucide-react"

import { getPaletteColor } from "@/lib/color-tokens"

import type {
  CanvasNodeColorId,
  CanvasShape,
  CanvasStrokeStyle,
  CanvasStrokeWidth,
  CanvasTool,
} from "./types"

function canvasColorOption(
  id: CanvasNodeColorId,
  label: string,
): {
  fill: string
  id: CanvasNodeColorId
  label: string
  stroke: string
} {
  if (id === "default") {
    return {
      id,
      label,
      fill: "transparent",
      stroke: "var(--color-foreground)",
    }
  }

  return {
    id,
    label,
    fill: getPaletteColor(id) ?? "transparent",
    stroke: getPaletteColor(id) ?? "var(--color-foreground)",
  }
}

export const canvasColorOptions: Array<{
  fill: string
  id: CanvasNodeColorId
  label: string
  stroke: string
}> = [
  canvasColorOption("default", "Default"),
  canvasColorOption("yellow", "Yellow"),
  canvasColorOption("red", "Red"),
  canvasColorOption("green", "Green"),
  canvasColorOption("blue", "Blue"),
  canvasColorOption("purple", "Purple"),
  canvasColorOption("orange", "Orange"),
  canvasColorOption("gray", "Gray"),
]

export const canvasStrokeWidthOptions: Array<{
  label: string
  value: CanvasStrokeWidth
}> = [
  { label: "Thin", value: 2 },
  { label: "Medium", value: 4 },
  { label: "Bold", value: 6 },
]

export const canvasStrokeStyleOptions: Array<{
  label: string
  value: CanvasStrokeStyle
}> = [
  { label: "Solid", value: "solid" },
  { label: "Dashed", value: "dashed" },
  { label: "Dotted", value: "dotted" },
]

export const defaultCanvasStrokeWidth: CanvasStrokeWidth = 4
export const defaultCanvasStrokeStyle: CanvasStrokeStyle = "solid"
export const defaultCanvasSloppiness = "artist"

export const canvasShapeOptions: Array<{
  icon: LucideIcon
  label: string
  shape: CanvasShape
}> = [
  { icon: CircleIcon, label: "Circle", shape: "circle" },
  { icon: SquareIcon, label: "Rectangle", shape: "rectangle" },
  { icon: DiamondIcon, label: "Diamond", shape: "diamond" },
]

export const canvasShapeDimensions: Record<
  CanvasShape,
  { height: number; width: number }
> = {
  circle: { height: 108, width: 108 },
  rectangle: { height: 80, width: 136 },
  diamond: { height: 120, width: 120 },
}

export const canvasToolOptions: Array<{
  icon: LucideIcon
  label: string
  tool: CanvasTool
}> = [
  ...canvasShapeOptions.map(({ icon, label, shape }) => ({
    icon,
    label,
    tool: shape,
  })),
  { icon: ArrowRightIcon, label: "Arrow", tool: "arrow" },
]

export function getCanvasColorOption(colorId: CanvasNodeColorId) {
  return (
    canvasColorOptions.find((option) => option.id === colorId) ??
    canvasColorOptions[0]
  )
}