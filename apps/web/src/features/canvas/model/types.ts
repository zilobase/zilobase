import type { Edge, Node } from "@xyflow/react"

export type CanvasShape = "circle" | "rectangle" | "diamond"
export type CanvasTool = CanvasShape | "arrow"

export type CanvasNodeColorId =
  | "default"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "gray"

export type CanvasStrokeWidth = 2 | 4 | 6

export type CanvasStrokeStyle = "solid" | "dashed" | "dotted"

export type CanvasSloppiness = "architect" | "artist" | "cartoonist"

export type CanvasShapeNodeData = {
  color: CanvasNodeColorId
  rotation: number
  seed: number
  shape: CanvasShape
  strokeStyle: CanvasStrokeStyle
  strokeWidth: CanvasStrokeWidth
}

export type CanvasAnchorNodeData = Record<string, never>

export type CanvasShapeNode = Node<CanvasShapeNodeData, "shape">
export type CanvasAnchorNode = Node<CanvasAnchorNodeData, "anchor">
export type CanvasNode = CanvasShapeNode | CanvasAnchorNode

export type CanvasArrowEdgeData = {
  color: CanvasNodeColorId
  strokeStyle: CanvasStrokeStyle
  strokeWidth: CanvasStrokeWidth
}

export type CanvasArrowEdge = Edge<CanvasArrowEdgeData, "arrow">
export type CanvasEdge = CanvasArrowEdge
