import type { Editor } from "@tiptap/core"
import type { MutableRefObject } from "react"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { EmbedProvider } from "@/packages/editor/extensions/embed-block"
import type {
  DragHandleTarget,
} from "@/packages/editor/components/editor/types"
import type { CreatedPage } from "@/packages/editor/extensions/page-block"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type { CollaborationUser } from "./use-page-collaboration"
import type { PageLayoutConfig } from "@notelab/features/pages"

export type EditorCollaboration = {
  provider: HocuspocusProvider
  status: "connected" | "connecting" | "disconnected"
  user: { avatar?: string | null; color: string; id: string; name: string }
  users: CollaborationUser[]
}

export type PasteChoiceState = {
  anchor: { getBoundingClientRect: () => DOMRect }
  embedAttrs?: Record<string, unknown>
  from: number
  provider?: EmbedProvider | null
  to: number
  url: string
}

export type SelectionAiDiffPreview = {
  baselineMarkdown?: string
  from: number
  generatedMarkdown: string
  isStreaming: boolean
  source?: "selection" | "page-edit"
  to: number
  toolCallId?: string
  useBeforeBaseline?: boolean
}

export type PageEditPreviewRequest = {
  afterMarkdown: string
  beforeMarkdown?: string
  onAccepted?: () => void
  onDeclined?: () => void
  toolCallId: string
  useBeforeBaseline?: boolean
}

export type PageEditPreviewClearOptions = {
  silent?: boolean
}

export type PageEditPreviewControls = {
  accept: () => boolean
  clear: (options?: PageEditPreviewClearOptions) => void
  isActive: () => boolean
  show: (request: PageEditPreviewRequest) => boolean
  toolCallId: () => string | null
}

export type OpenPageOptions = {
  databaseId?: string | null
}

export type EditorProps = {
  content?: unknown
  collaboration?: EditorCollaboration
  cover?: string
  databaseId?: string | null
  editorContentRef?: MutableRefObject<(() => unknown) | null>
  onEditorReady?: (editor: Editor | null) => void
  emoji?: string
  editable?: boolean
  enableComments?: boolean
  fullWidth?: boolean
  layoutConfig?: PageLayoutConfig
  layoutPreview?: boolean
  onLayoutChange?: (config: PageLayoutConfig) => void
  onContentChange?: (content: unknown) => void
  onCoverChange?: (cover: string) => void
  onCreatePage?: () => Promise<CreatedPage>
  onEmbedPage?: (pageId: string) => void | Promise<void>
  onEmojiChange?: (emoji: string) => void
  onOpenPage?: (pageId: string, options?: OpenPageOptions) => void
  onTitleChange?: (title: string) => void
  workspaceId?: string | null
  title?: string
  pageEditPreviewRef?: MutableRefObject<PageEditPreviewControls | null>
  pageId?: string | null
}

export type UseEditorExtensionsOptions = {
  content: unknown
  collaboration?: EditorCollaboration
  createEditorDatabase: () => Promise<string | null>
  databaseEditorRuntime: import("@/packages/editor/extensions/database").DatabaseBlockEditorRuntime
  editable: boolean
  onCreatePage?: () => Promise<CreatedPage>
  onEmbedPage?: (pageId: string) => void | Promise<void>
  onOpenPage?: (pageId: string, options?: OpenPageOptions) => void
  workspaceId?: string | null
  pageId?: string | null
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
