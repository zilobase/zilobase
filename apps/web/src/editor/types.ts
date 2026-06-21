import type { Editor } from "@tiptap/core"
import type { MutableRefObject } from "react"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { EmbedProvider } from "@/packages/editor/extensions/embed-block"
import type {
  DragHandleTarget,
} from "@/packages/editor/components/editor/types"
import type { CreatedPage } from "@/packages/editor/extensions/page-block"

export type PasteChoiceState = {
  anchor: { getBoundingClientRect: () => DOMRect }
  embedAttrs: Record<string, unknown>
  from: number
  provider: EmbedProvider
  to: number
  url: string
}

export type SelectionAiDiffPreview = {
  baselineMarkdown?: string
  from: number
  generatedMarkdown: string
  isStreaming: boolean
  source?: "selection" | "workspace-edit"
  to: number
  toolCallId?: string
  useBeforeBaseline?: boolean
}

export type WorkspaceEditPreviewRequest = {
  afterMarkdown: string
  beforeMarkdown?: string
  onAccepted?: () => void
  onDeclined?: () => void
  toolCallId: string
  useBeforeBaseline?: boolean
}

export type WorkspaceEditPreviewClearOptions = {
  silent?: boolean
}

export type WorkspaceEditPreviewControls = {
  accept: () => boolean
  clear: (options?: WorkspaceEditPreviewClearOptions) => void
  isActive: () => boolean
  show: (request: WorkspaceEditPreviewRequest) => boolean
  toolCallId: () => string | null
}

export type EditorProps = {
  content?: unknown
  cover?: string
  editorContentRef?: MutableRefObject<(() => unknown) | null>
  onEditorReady?: (editor: Editor | null) => void
  emoji?: string
  editable?: boolean
  fullWidth?: boolean
  onCollaborationReadyChange?: (ready: boolean) => void
  onContentChange?: (content: unknown) => void
  onCoverChange?: (cover: string) => void
  onCreatePage?: () => Promise<CreatedPage>
  onEmbedPage?: (pageId: string) => void | Promise<void>
  onEmojiChange?: (emoji: string) => void
  onOpenPage?: (pageId: string) => void
  onTitleChange?: (title: string) => void
  organizationId?: string | null
  title?: string
  workspaceEditPreviewRef?: MutableRefObject<WorkspaceEditPreviewControls | null>
  workspaceId?: string | null
  workspaceUpdatedAt?: string | null
}

export type NodePlacement = {
  index: number
  parent: ProseMirrorNode | null
  pos: number
}

export type BlockDropLine = {
  left: number
  right: number
  top: number
}

export type DragHandleState = {
  position: { left: number; top: number }
  target: DragHandleTarget
}

export type DatabasePageDropPayload = {
  blockPayload?: import("@/packages/editor/components/editor/block-drag").BlockDragPayload
  pageId: string
  title?: string
}

export type EditorTableType = "columns" | "table" | "unknown"
