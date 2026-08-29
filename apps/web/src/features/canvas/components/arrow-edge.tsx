import { useCallback, useEffect, useMemo, useRef } from "react"
import {
  BaseEdge,
  EdgeToolbar,
  type EdgeProps,
  useInternalNode,
  useReactFlow,
} from "@xyflow/react"
import { Trash2Icon } from "@/shared/components/icons"

import {
  getCanvasColorOption,
  defaultCanvasStrokeStyle,
  defaultCanvasStrokeWidth,
} from "../model/constants"
import {
  isCanvasConnectableNode,
  getNodeCenter,
  getNodeConnectionPoint,
  isPointInsideNode,
  isCanvasAnchorNode,
} from "../model/canvas-geometry"
import type { CanvasArrowEdge, CanvasEdge, CanvasNode } from "../model/types"

const endpointSize = 14

type DragEndpoint = "source" | "target"

type EndpointPosition = {
  x: number
  y: number
}

const endpointHandleIds = {
  source: {
    anchor: "anchor-source",
    shape: "shape-source",
  },
  target: {
    anchor: "anchor-target",
    shape: "shape-target",
  },
} as const

export function ArrowEdge({
  data,
  id,
  selected,
  source,
  target,
}: EdgeProps<CanvasArrowEdge>) {
  const sourceNode = useInternalNode<CanvasNode>(source)
  const targetNode = useInternalNode<CanvasNode>(target)
  const {
    deleteElements,
    getNode,
    getNodes,
    screenToFlowPosition,
    setEdges,
    setNodes,
  } =
    useReactFlow<CanvasNode, CanvasEdge>()
  const dragSessionRef = useRef<{
    endpoint: DragEndpoint
  } | null>(null)
  const color = getCanvasColorOption(data?.color ?? "default")

  const positions = useMemo(() => {
    if (!sourceNode || !targetNode) {
      return null
    }

    const sourceCenter = getNodeCenter(sourceNode)
    const targetCenter = getNodeCenter(targetNode)

    return {
      source: isCanvasConnectableNode(sourceNode)
        ? getNodeConnectionPoint(sourceNode, targetCenter)
        : sourceCenter,
      target: isCanvasConnectableNode(targetNode)
        ? getNodeConnectionPoint(targetNode, sourceCenter)
        : targetCenter,
    }
  }, [sourceNode, targetNode])

  const path = useMemo(() => {
    if (!positions) {
      return ""
    }

    return `M ${positions.source.x} ${positions.source.y} L ${positions.target.x} ${positions.target.y}`
  }, [positions])

  const markerId = `canvas-arrow-head-${id}`
  const labelPosition = useMemo(() => {
    if (!positions) {
      return null
    }

    return {
      x: (positions.source.x + positions.target.x) / 2,
      y: (positions.source.y + positions.target.y) / 2,
    }
  }, [positions])

  const moveEndpoint = useCallback(
    (endpoint: DragEndpoint, nextPosition: EndpointPosition) => {
      const currentNodeId = endpoint === "source" ? source : target
      const currentNode = getNode(currentNodeId)
      const nextAnchorNodeId = isCanvasAnchorNode(currentNode)
        ? currentNodeId
        : `anchor-${id}-${endpoint}`

      setNodes((currentNodes) => {
        const existingAnchorIndex = currentNodes.findIndex(
          (node) => node.id === nextAnchorNodeId,
        )

        if (existingAnchorIndex === -1) {
          return [
            ...currentNodes,
            {
              id: nextAnchorNodeId,
              type: "anchor",
              data: {},
              draggable: false,
              position: nextPosition,
              selectable: false,
            },
          ]
        }

        return currentNodes.map((node) =>
          node.id === nextAnchorNodeId
            ? {
                ...node,
                position: nextPosition,
              }
            : node,
        )
      })

      setEdges((currentEdges) =>
        currentEdges.map((edge) =>
          edge.id === id
            ? {
                ...edge,
                [endpoint]: nextAnchorNodeId,
                [`${endpoint}Handle`]: endpointHandleIds[endpoint].anchor,
              }
            : edge,
        ),
      )
    },
    [getNode, id, setEdges, setNodes, source, target],
  )

  const connectEndpoint = useCallback(
    (endpoint: DragEndpoint, nodeId: string) => {
      setEdges((currentEdges) =>
        currentEdges.map((edge) =>
          edge.id === id
            ? {
                ...edge,
                [endpoint]: nodeId,
                [`${endpoint}Handle`]: endpointHandleIds[endpoint].shape,
              }
            : edge,
        ),
      )
    },
    [id, setEdges],
  )

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const session = dragSessionRef.current

      if (!session) {
        return
      }

      moveEndpoint(
        session.endpoint,
        screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        }),
      )
    }

    const onMouseUp = (event: MouseEvent) => {
      const session = dragSessionRef.current

      if (!session) {
        return
      }

      dragSessionRef.current = null

      const releasePosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      const nextNode = getNearestShapeNode(releasePosition, getNodes())

      if (nextNode) {
        connectEndpoint(session.endpoint, nextNode.id)
      }
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)

    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [connectEndpoint, getNodes, moveEndpoint, screenToFlowPosition])

  if (!positions || !labelPosition) {
    return null
  }

  const strokeWidth = data?.strokeWidth ?? defaultCanvasStrokeWidth
  const strokeStyle = data?.strokeStyle ?? defaultCanvasStrokeStyle
  const strokeDasharray =
    strokeStyle === "dashed"
      ? `${strokeWidth * 3} ${strokeWidth * 2}`
      : strokeStyle === "dotted"
        ? `${strokeWidth} ${strokeWidth * 1.6}`
        : undefined

  return (
    <>
      <defs>
        <marker
          id={markerId}
          markerHeight="18"
          markerUnits="userSpaceOnUse"
          markerWidth="18"
          orient="auto-start-reverse"
          refX="17"
          refY="9"
        >
          <path
            d="M 3 3 L 17 9 M 3 15 L 17 9"
            fill="none"
            stroke={color.stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
          />
        </marker>
      </defs>
      <BaseEdge
        interactionWidth={24}
        markerEnd={`url(#${markerId})`}
        path={path}
        style={{
          stroke: color.stroke,
          strokeDasharray,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          strokeWidth,
        }}
      />
      {selected ? (
        <>
          <circle
            className="nopan"
            cx={positions.source.x}
            cy={positions.source.y}
            fill="var(--color-background)"
            onMouseDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              dragSessionRef.current = { endpoint: "source" }
            }}
            r={endpointSize / 2}
            stroke={color.stroke}
            strokeWidth={2}
            style={{ cursor: "grab", pointerEvents: "all" }}
          />
          <circle
            className="nopan"
            cx={positions.target.x}
            cy={positions.target.y}
            fill="var(--color-background)"
            onMouseDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              dragSessionRef.current = { endpoint: "target" }
            }}
            r={endpointSize / 2}
            stroke={color.stroke}
            strokeWidth={2}
            style={{ cursor: "grab", pointerEvents: "all" }}
          />
        </>
      ) : null}
      <EdgeToolbar edgeId={id} isVisible={selected} x={labelPosition.x} y={labelPosition.y}>
        <button
          aria-label="Delete arrow"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          onClick={() => void deleteElements({ edges: [{ id }] })}
          type="button"
        >
          <Trash2Icon className="size-4" />
        </button>
      </EdgeToolbar>
    </>
  )
}

function getNearestShapeNode(position: EndpointPosition, nodes: CanvasNode[]) {
  for (const node of nodes) {
    if (isCanvasConnectableNode(node) && isPointInsideNode(position, node)) {
      return node
    }
  }

  return undefined
}
