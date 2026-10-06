import type { Editor } from "@tiptap/core";
import type { MutableRefObject, ReactNode } from "react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EmbedProvider } from "../extensions/embed-block";
import type { DragHandleTarget } from "../toolbar/toolbar-contracts";
import type { CreatedPage } from "../extensions/page-block";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { CollaborationUser } from "../collaboration/collaboration-contracts";
import type { PageLayoutConfig } from "@zilobase/features/pages";
import type { PageIconPosition } from "@zilobase/features/pages";
import type { OpenPageOptions } from "@/features/pages";
import type { PageCommentController } from "@/features/comments/index";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import type { StructuralInsertionPendingChange } from "../commands/structural-insertion";

export type EditorCollaboration = {
  document: Y.Doc;
  awareness?: Awareness;
  provider?: HocuspocusProvider;
  status: "local" | "connected" | "connecting" | "disconnected" | "blocked";
  unsyncedChanges: number;
  user?: { avatar?: string | null; color: string; id: string; name: string };
  users: CollaborationUser[];
};

export type PasteChoiceState = {
  anchor: { getBoundingClientRect: () => DOMRect };
  embedAttrs?: Record<string, unknown>;
  from: number;
  provider?: EmbedProvider | null;
  to: number;
  url: string;
};

export type SelectionAiDiffPreview = {
  baselineMarkdown?: string;
  from: number;
  generatedMarkdown: string;
  isStreaming: boolean;
  source?: "selection" | "page-edit";
  to: number;
  toolCallId?: string;
  useBeforeBaseline?: boolean;
};

export type PageEditPreviewRequest = {
  afterMarkdown: string;
  beforeMarkdown?: string;
  onAccepted?: () => void;
  onDeclined?: () => void;
  toolCallId: string;
  useBeforeBaseline?: boolean;
};

export type PageEditPreviewClearOptions = {
  silent?: boolean;
};

export type PageEditPreviewControls = {
  accept: () => boolean;
  clear: (options?: PageEditPreviewClearOptions) => void;
  isActive: () => boolean;
  show: (request: PageEditPreviewRequest) => boolean;
  toolCallId: () => string | null;
};

export type PageLayoutPanelMode = "auto" | "overlay";

export type StructuralBlockDeleteRequest = {
  id: string;
  type: "database" | "meeting";
};

export type StructuralBlockDeleteAction = "move-to-trash" | "remove-link";

export type EditorResourceReceipt = {
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};
export type EditorResourceLink = (
  id: string,
) => void | EditorResourceReceipt | Promise<void | EditorResourceReceipt>;

export type StructuralBlockDeleteHistory = {
  redo: () => Promise<void>;
  undo: () => Promise<void>;
};

export type DocumentSession = {
  kind?: "page" | "meeting" | "local";
  documentId?: string;
  pageId?: string | null;
  workspaceId?: string | null;
  collaboration?: EditorCollaboration;
  collaborationField?: string;
  content?: unknown;
  databaseId?: string | null;
  databaseIds?: string[];
};
export type EditorCapabilities = {
  content?: boolean;
  metadata?: boolean;
  structural?: boolean;
  comments?: boolean;
  database?: boolean;
};
export type EditorRuntimeHandle = {
  getSession: () => DocumentSession;
  getCapabilities: () => EditorCapabilities;
  getActions: () => EditorResourceActions;
};
export type EditorResourceActions = {
  onContentChange?: (
    readContent: () => unknown,
    transaction?: import("@tiptap/pm/state").Transaction,
  ) => void;
  onCoverChange?: (cover: string) => void;
  onCreatePage?: () => Promise<CreatedPage>;
  onEmbedDatabase?: EditorResourceLink;
  onMoveDatabase?: (databaseId: string, sourcePageId: string) => Promise<EditorResourceReceipt>;
  onEmbedPage?: EditorResourceLink;
  onEmojiChange?: (emoji: string) => void;
  onIconPositionChange?: (position: PageIconPosition) => void;
  getStructuralBlockDeleteAction?: (
    request: StructuralBlockDeleteRequest,
  ) => StructuralBlockDeleteAction;
  onDeleteStructuralBlock?: (
    request: StructuralBlockDeleteRequest,
  ) => Promise<StructuralBlockDeleteHistory | void>;
  onOpenPage?: (pageId: string, options?: OpenPageOptions) => void;
  onStructuralInsertionPendingChange?: StructuralInsertionPendingChange;
  onTitleChange?: (title: string) => void;
};
export type EditorPresentation = {
  afterMetadata?: ReactNode;
  commentController?: PageCommentController;
  cover?: string;
  emoji?: string;
  iconPosition?: PageIconPosition;
  fullWidth?: boolean;
  enableComments?: boolean;
  hideEditorContent?: boolean;
  hideMetadata?: boolean;
  layoutConfig?: PageLayoutConfig;
  layoutPanelMode?: PageLayoutPanelMode;
  layoutPreview?: boolean;
  onLayoutChange?: (config: PageLayoutConfig) => void;
  title?: string;
  reviewDiff?: { beforeMarkdown: string; afterMarkdown: string } | null;
};
export type EditorViewHandle = {
  viewId?: string;
  paneId?: string;
  editorContentRef?: MutableRefObject<(() => unknown) | null>;
  editorTabIndex?: number;
  onEditorReady?: (editor: Editor | null) => void;
  pageEditPreviewRef?: MutableRefObject<PageEditPreviewControls | null>;
};
export type EditorProps = {
  session?: DocumentSession;
  capabilities?: EditorCapabilities;
  actions?: EditorResourceActions;
  presentation?: EditorPresentation;
  view?: EditorViewHandle;
};

export type UseEditorExtensionsOptions = {
  content: unknown;
  collaboration?: EditorCollaboration;
  collaborationField?: string;
  createEditorDatabase: () => Promise<string | null>;
  createEditorMeeting: () => Promise<string | null>;
  databaseEditorRuntime: import("@/features/databases").DatabaseBlockEditorRuntime;
  editable: boolean;
  structuralEditingEnabled: boolean;
  isStructuralEditingEnabled?: () => boolean;
  onCreatePage?: () => Promise<CreatedPage>;
  onEmbedPage?: EditorResourceLink;
  onOpenPage?: (pageId: string, options?: OpenPageOptions) => void;
  onStructuralInsertionPendingChange?: StructuralInsertionPendingChange;
  workspaceId?: string | null;
  pageId?: string | null;
};

export type NodePlacement = {
  index: number;
  parent: ProseMirrorNode | null;
  pos: number;
};

export type BlockDropLine = {
  left: number;
  right: number;
  top: number;
};

export type DragHandleState = {
  position: { left: number; top: number };
  target: DragHandleTarget;
};

export type DatabasePageDropPayload = {
  blockPayload?: import("../drag-drop/block-drag").BlockDragPayload;
  pageId: string;
  title?: string;
};

export type EditorTableType = "columns" | "table" | "unknown";
