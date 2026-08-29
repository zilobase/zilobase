import { Handle, Position, type NodeProps } from "@xyflow/react"

import type { CanvasAnchorNode } from "../model/types"

export function AnchorNode(_props: NodeProps<CanvasAnchorNode>) {
  return (
    <div className="relative h-px w-px opacity-0">
      <Handle
        className="pointer-events-none !h-px !w-px !border-0 !bg-transparent"
        id="anchor-target"
        isConnectable={false}
        position={Position.Top}
        type="target"
      />
      <Handle
        className="pointer-events-none !h-px !w-px !border-0 !bg-transparent"
        id="anchor-source"
        isConnectable={false}
        position={Position.Bottom}
        type="source"
      />
    </div>
  )
}
