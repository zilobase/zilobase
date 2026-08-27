import type { InternalNode, XYPosition } from "@xyflow/react"

import type { CanvasNode } from "./types"

type CanvasNodeWithLayout =
  | CanvasNode
  | InternalNode<CanvasNode>

type CanvasRect = {
  bottom: number
  centerX: number
  centerY: number
  height: number
  left: number
  right: number
  top: number
  width: number
}

const shapeInset = 6

export function getDistance(start: XYPosition, end: XYPosition) {
  return Math.hypot(end.x - start.x, end.y - start.y)
}

export function isCanvasConnectableNode(
  node: CanvasNodeWithLayout | null | undefined,
): node is Extract<CanvasNodeWithLayout, { type: "shape" }> {
  return node?.type === "shape"
}

export function isCanvasAnchorNode(
  node: CanvasNodeWithLayout | null | undefined,
): node is Extract<CanvasNodeWithLayout, { type: "anchor" }> {
  return node?.type === "anchor"
}

function getNodeRect(node: CanvasNodeWithLayout): CanvasRect {
  const width = Math.max(node.measured?.width ?? node.width ?? 1, 1)
  const height = Math.max(node.measured?.height ?? node.height ?? 1, 1)
  const position =
    "internals" in node ? node.internals.positionAbsolute : node.position

  return {
    bottom: position.y + height,
    centerX: position.x + width / 2,
    centerY: position.y + height / 2,
    height,
    left: position.x,
    right: position.x + width,
    top: position.y,
    width,
  }
}

export function isPointInsideNode(
  point: XYPosition,
  node: CanvasNodeWithLayout,
) {
  const rect = getNodeRect(node)

  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  )
}

export function getNodeCenter(node: CanvasNodeWithLayout): XYPosition {
  const rect = getNodeRect(node)

  return {
    x: rect.centerX,
    y: rect.centerY,
  }
}

export function getNodeConnectionPoint(
  node: CanvasNodeWithLayout,
  toward: XYPosition,
): XYPosition {
  const center = getNodeCenter(node)

  if (!isCanvasConnectableNode(node)) {
    return center
  }

  const dx = toward.x - center.x
  const dy = toward.y - center.y

  if (dx === 0 && dy === 0) {
    return center
  }

  const rect = getNodeRect(node)
  const rx = Math.max(rect.width / 2 - shapeInset, 1)
  const ry = Math.max(rect.height / 2 - shapeInset, 1)

  if (node.type === "shape" && node.data.shape === "circle") {
    const scale = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry))

    return {
      x: center.x + dx * scale,
      y: center.y + dy * scale,
    }
  }

  if (node.type === "shape" && node.data.shape === "diamond") {
    const scale = 1 / (Math.abs(dx) / rx + Math.abs(dy) / ry)

    return {
      x: center.x + dx * scale,
      y: center.y + dy * scale,
    }
  }

  const scale = 1 / Math.max(Math.abs(dx) / rx, Math.abs(dy) / ry)

  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale,
  }
}
