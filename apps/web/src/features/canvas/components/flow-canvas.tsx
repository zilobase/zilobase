import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  type EdgeTypes,
  type OnEdgesChange,
  type OnNodesChange,
  type NodeTypes,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react"
import { nanoid } from "nanoid"
import rough from "roughjs"
import type { MouseEvent as ReactMouseEvent } from "react"

import { AnchorNode } from "./anchor-node"
import { ArrowEdge } from "./arrow-edge"
import { BottomDock } from "./bottom-dock"
import {
  defaultCanvasStrokeStyle,
  defaultCanvasStrokeWidth,
  getCanvasColorOption,
} from "../model/constants"
import {
  getDistance,
  isCanvasConnectableNode,
  isPointInsideNode,
} from "../model/canvas-geometry"
import { initialNodes } from "../model/initial-elements"
import { ShapeNode } from "./shape-node"
import { ShapeSvg } from "./shape-svg"
import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeColorId,
  CanvasShape,
  CanvasTool,
} from "../model/types"

const nodeTypes: NodeTypes = {
  anchor: AnchorNode,
  shape: ShapeNode,
}

const edgeTypes: EdgeTypes = {
  arrow: ArrowEdge,
}

const minimumArrowLength = 12

type ClientPoint = {
  x: number
  y: number
}

type DraftItem = {
  currentClient: ClientPoint
  seed: number
  startClient: ClientPoint
  tool: CanvasTool
}

export function FlowCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [nodes, setNodes] = useState<CanvasNode[]>(initialNodes)
  const [edges, setEdges] = useState<CanvasEdge[]>([])
  const [activeTool, setActiveTool] = useState<CanvasTool | null>(null)
  const [draftItem, setDraftItem] = useState<DraftItem | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const { getNodes, screenToFlowPosition } = useReactFlow<CanvasNode, CanvasEdge>()

  const onNodesChange = useCallback<OnNodesChange<CanvasNode>>((changes) => {
    setNodes((currentNodes) => applyNodeChanges(changes, currentNodes))
  }, [])

  const onEdgesChange = useCallback<OnEdgesChange<CanvasEdge>>((changes) => {
    setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges))
  }, [])

  useEffect(() => {
    setNodes((currentNodes) => pruneDanglingAnchorNodes(currentNodes, edges))
  }, [edges])

  const selectTool = useCallback((tool: CanvasTool) => {
    setActiveTool((current) => (current === tool ? null : tool))
    setDraftItem(null)
    setPickerOpen(false)
  }, [])

  const resetCanvas = useCallback(() => {
    setNodes(initialNodes)
    setEdges([])
    setActiveTool(null)
    setDraftItem(null)
    setPickerOpen(false)
  }, [])

  const togglePicker = useCallback(() => {
    setPickerOpen((current) => !current)
  }, [])

  const startDrawing = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!activeTool || event.button !== 0) {
        return
      }

      const nextPoint = { x: event.clientX, y: event.clientY }
      setDraftItem({
        currentClient: nextPoint,
        seed: rough.newSeed(),
        startClient: nextPoint,
        tool: activeTool,
      })
    },
    [activeTool],
  )

  const updateDrawing = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!draftItem) {
        return
      }

      setDraftItem((current) =>
        current
          ? {
              ...current,
              currentClient: {
                x: event.clientX,
                y: event.clientY,
              },
            }
          : null,
      )
    },
    [draftItem],
  )

  const finishDrawing = useCallback(
    (event?: ReactMouseEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect()

      if (!draftItem || !rect) {
        return
      }

      const endClient = event
        ? { x: event.clientX, y: event.clientY }
        : draftItem.currentClient
      const startFlow = screenToFlowPosition({
        x: draftItem.startClient.x,
        y: draftItem.startClient.y,
      })
      const endFlow = screenToFlowPosition({
        x: endClient.x,
        y: endClient.y,
      })

      if (draftItem.tool === "arrow") {
        if (getDistance(startFlow, endFlow) < minimumArrowLength) {
          setDraftItem(null)
          return
        }

        const connectableNodes = getNodes().filter(isCanvasConnectableNode)
        const startNode = getConnectableNodeAtPoint(connectableNodes, startFlow)
        const endNode = getConnectableNodeAtPoint(connectableNodes, endFlow)
        const nextAnchorNodes: CanvasNode[] = []
        const sourceId = startNode?.id ?? `anchor-${nanoid()}`
        const targetId = endNode?.id ?? `anchor-${nanoid()}`

        if (!startNode) {
          nextAnchorNodes.push(createAnchorNode(sourceId, startFlow))
        }

        if (!endNode) {
          nextAnchorNodes.push(createAnchorNode(targetId, endFlow))
        }

        if (nextAnchorNodes.length > 0) {
          setNodes((currentNodes) => [...currentNodes, ...nextAnchorNodes])
        }

        setEdges((currentEdges) => [
          ...currentEdges,
          {
            id: `arrow-${nanoid()}`,
            type: "arrow",
            data: {
              color: "default",
              strokeStyle: defaultCanvasStrokeStyle,
              strokeWidth: defaultCanvasStrokeWidth,
            },
            source: sourceId,
            sourceHandle: startNode ? "shape-source" : "anchor-source",
            target: targetId,
            targetHandle: endNode ? "shape-target" : "anchor-target",
          },
        ])
        setActiveTool(null)
        setDraftItem(null)
        return
      }

      const localBounds = getDraftBounds(
        {
          x: draftItem.startClient.x - rect.left,
          y: draftItem.startClient.y - rect.top,
        },
        {
          x: endClient.x - rect.left,
          y: endClient.y - rect.top,
        },
      )

      if (localBounds.width === 0 || localBounds.height === 0) {
        setDraftItem(null)
        return
      }

      const flowTopLeft = screenToFlowPosition({
        x: rect.left + localBounds.left,
        y: rect.top + localBounds.top,
      })
      const flowBottomRight = screenToFlowPosition({
        x: rect.left + localBounds.left + localBounds.width,
        y: rect.top + localBounds.top + localBounds.height,
      })

      setNodes((currentNodes) => [
        ...currentNodes,
        {
          id: `shape-${nanoid()}`,
          type: "shape",
          data: {
            color: "default",
            rotation: 0,
            seed: draftItem.seed,
            shape: draftItem.tool as CanvasShape,
            strokeStyle: defaultCanvasStrokeStyle,
            strokeWidth: defaultCanvasStrokeWidth,
          },
          position: flowTopLeft,
          style: {
            height: Math.abs(flowBottomRight.y - flowTopLeft.y),
            width: Math.abs(flowBottomRight.x - flowTopLeft.x),
          },
        },
      ])
      setActiveTool(null)
      setDraftItem(null)
    },
    [draftItem, getNodes, screenToFlowPosition],
  )

  const draftBounds = useMemo(() => {
    if (!draftItem || draftItem.tool === "arrow" || !containerRef.current) {
      return null
    }

    const rect = containerRef.current.getBoundingClientRect()

    return getDraftBounds(
      {
        x: draftItem.startClient.x - rect.left,
        y: draftItem.startClient.y - rect.top,
      },
      {
        x: draftItem.currentClient.x - rect.left,
        y: draftItem.currentClient.y - rect.top,
      },
    )
  }, [draftItem])

  const draftArrow = useMemo(() => {
    if (!draftItem || draftItem.tool !== "arrow" || !containerRef.current) {
      return null
    }

    const rect = containerRef.current.getBoundingClientRect()

    return {
      end: {
        x: draftItem.currentClient.x - rect.left,
        y: draftItem.currentClient.y - rect.top,
      },
      start: {
        x: draftItem.startClient.x - rect.left,
        y: draftItem.startClient.y - rect.top,
      },
    }
  }, [draftItem])

  return (
    <div
      className="relative h-full min-h-[calc(100svh-3rem)] w-full bg-background"
      ref={containerRef}
    >
      <ReactFlow
        className="bg-background"
        connectionMode={ConnectionMode.Loose}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        edgeTypes={edgeTypes}
        edges={edges}
        nodes={nodes}
        nodeTypes={nodeTypes}
        panOnDrag={!activeTool && !draftItem}
        onEdgesChange={onEdgesChange}
        onNodesChange={onNodesChange}
        onNodesDelete={(deletedNodes) => {
          const deletedIds = new Set(deletedNodes.map((node) => node.id))

          setEdges((currentEdges) =>
            currentEdges.filter(
              (edge) =>
                !deletedIds.has(edge.source) &&
                !deletedIds.has(edge.target),
            ),
          )
        }}
        onPaneClick={() => {
          setPickerOpen(false)
        }}
      >
        <Background gap={20} size={1} variant={BackgroundVariant.Dots} />
        <Controls />
        <MiniMap
          className="rounded-xl border border-border bg-background"
          nodeColor={(node) =>
            node.type === "shape"
              ? getCanvasColorOption(
                  (node.data as { color: CanvasNodeColorId }).color,
                ).stroke
              : "transparent"
          }
          pannable
          zoomable
        />
      </ReactFlow>
      {activeTool ? (
        <div
          className="absolute inset-0 z-10 cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseLeave={() => {
            if (draftItem) {
              finishDrawing()
            }
          }}
          onMouseMove={updateDrawing}
          onMouseUp={finishDrawing}
        />
      ) : null}
      {draftBounds ? (
        <div
          className="pointer-events-none absolute z-20"
          style={{
            height: draftBounds.height,
            left: draftBounds.left,
            top: draftBounds.top,
            width: draftBounds.width,
          }}
        >
          <ShapeSvg
            className="h-full w-full overflow-visible opacity-90"
            fill={getCanvasColorOption("default").fill}
            height={draftBounds.height}
            seed={draftItem?.seed ?? 0}
            shape={draftItem?.tool as CanvasShape}
            stroke={getCanvasColorOption("default").stroke}
            strokeStyle={defaultCanvasStrokeStyle}
            strokeWidth={defaultCanvasStrokeWidth}
            width={draftBounds.width}
          />
        </div>
      ) : null}
      {draftArrow ? (
        <svg className="pointer-events-none absolute inset-0 z-20 overflow-visible">
          <defs>
            <marker
              id="canvas-draft-arrow-head"
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
                stroke={getCanvasColorOption("default").stroke}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
              />
            </marker>
          </defs>
          <line
            markerEnd="url(#canvas-draft-arrow-head)"
            stroke={getCanvasColorOption("default").stroke}
            strokeLinecap="round"
            strokeWidth={defaultCanvasStrokeWidth}
            x1={draftArrow.start.x}
            x2={draftArrow.end.x}
            y1={draftArrow.start.y}
            y2={draftArrow.end.y}
          />
        </svg>
      ) : null}
      <BottomDock
        activeTool={activeTool}
        onReset={resetCanvas}
        onSelectTool={selectTool}
        open={pickerOpen}
        toggleOpen={togglePicker}
      />
    </div>
  )
}

function getDraftBounds(start: ClientPoint, end: ClientPoint) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const width = Math.abs(dx)
  const height = Math.abs(dy)

  return {
    height,
    left: dx >= 0 ? start.x : start.x - width,
    top: dy >= 0 ? start.y : start.y - height,
    width,
  }
}

function createAnchorNode(id: string, position: { x: number; y: number }): CanvasNode {
  return {
    id,
    type: "anchor",
    data: {},
    draggable: false,
    position,
    selectable: false,
  }
}

function getConnectableNodeAtPoint(
  nodes: CanvasNode[],
  point: { x: number; y: number },
) {
  return nodes.find(
    (node) => isCanvasConnectableNode(node) && isPointInsideNode(point, node),
  )
}

function pruneDanglingAnchorNodes(nodes: CanvasNode[], edges: CanvasEdge[]) {
  const connectedNodeIds = new Set<string>()

  edges.forEach((edge) => {
    connectedNodeIds.add(edge.source)
    connectedNodeIds.add(edge.target)
  })

  const nextNodes = nodes.filter(
    (node) => node.type !== "anchor" || connectedNodeIds.has(node.id),
  )

  return nextNodes.length === nodes.length ? nodes : nextNodes
}
