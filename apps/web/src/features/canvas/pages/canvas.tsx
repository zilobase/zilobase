import "@xyflow/react/dist/style.css"

import { ReactFlowProvider } from "@xyflow/react"

import { FlowCanvas } from "../components/flow-canvas"

export default function CanvasPage() {
  return (
    <main className="h-full">
      <ReactFlowProvider>
        <FlowCanvas />
      </ReactFlowProvider>
    </main>
  )
}
