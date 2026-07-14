import CharacterCount from "@tiptap/extension-character-count"
import {
  Details,
  DetailsContent,
  DetailsSummary,
} from "@tiptap/extension-details"
import Placeholder from "@tiptap/extension-placeholder"
import Link from "@tiptap/extension-link"
import {
  TableOfContents,
  type TableOfContentDataItem,
} from "@tiptap/extension-table-of-contents"
import { Table } from "@tiptap/extension-table"
import { TableCell } from "@tiptap/extension-table-cell"
import { TableHeader } from "@tiptap/extension-table-header"
import { TableRow } from "@tiptap/extension-table-row"
import { Markdown } from "@tiptap/markdown"
import TaskList from "@tiptap/extension-task-list"
import TextAlign from "@tiptap/extension-text-align"
import { BackgroundColor, Color, TextStyle } from "@tiptap/extension-text-style"
import Typography from "@tiptap/extension-typography"
import type { Extensions } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import Collaboration from "@tiptap/extension-collaboration"
import CollaborationCaret from "@tiptap/extension-collaboration-caret"
import { CommentExtension } from "@notelab/tiptap-comment-extension"
import type { PageCommentController } from "@/comments/yjs-comments"
import { AskAiBlock } from "@/packages/editor/extensions/ask-ai-block"
import { BookmarkBlock } from "@/packages/editor/extensions/bookmark-block"
import { CodeBlockShiki } from "@/packages/editor/extensions/code-block-shiki"
import { ColumnsExtension } from "@/packages/editor/extensions/columns"
import {
  DatabaseBlock,
  type DatabaseBlockEditorRuntime,
} from "@/packages/editor/extensions/database"
import { EmbedBlock } from "@/packages/editor/extensions/embed-block"
import { EmojiExtension } from "@/packages/editor/extensions/emoji"
import { FileBlock } from "@/packages/editor/extensions/file-block"
import { ImageBlock } from "@/packages/editor/extensions/image-block"
import { LinkMention } from "@/packages/editor/extensions/link-mention"
import {
  PageBlock,
  type CreatedPage,
} from "@/packages/editor/extensions/page-block"
import { BlockSelection } from "@/packages/editor/extensions/block-selection"
import { ShadcnTaskItem } from "@/packages/editor/extensions/shadcn-task-item"
import { SelectionAiPreview } from "@/packages/editor/extensions/selection-ai-preview"
import { SlashCommand } from "@/packages/editor/extensions/slash-command"
import { VideoBlock } from "@/packages/editor/extensions/video-block"
import type { OpenPageOptions } from "./types"

export type BaseExtensionsOptions = {
  commentController?: PageCommentController
  collaboration?: import("./types").EditorCollaboration
  createEditorDatabase: () => Promise<string | null>
  databaseEditorRuntime: DatabaseBlockEditorRuntime
  editable: boolean
  onCreatePage?: () => Promise<CreatedPage>
  onEmbedPage?: (pageId: string) => void | Promise<void>
  onOpenPage?: (pageId: string, options?: OpenPageOptions) => void
  onTocUpdate: (items: TableOfContentDataItem[]) => void
  workspaceId?: string | null
  pageId?: string | null
}

export function normalizeEditorContent(content: unknown) {
  if (typeof content === "string") {
    const trimmed = content.trim()

    if (!trimmed) {
      return ""
    }

    try {
      return JSON.parse(trimmed) as unknown
    } catch {
      return content
    }
  }

  return content ?? ""
}

export const createBaseExtensions = ({
  commentController,
  collaboration,
  createEditorDatabase,
  databaseEditorRuntime,
  editable,
  onCreatePage,
  onEmbedPage,
  onOpenPage,
  onTocUpdate,
  workspaceId,
  pageId,
}: BaseExtensionsOptions): Extensions => [
  StarterKit.configure({
    codeBlock: false,
    dropcursor: false,
    link: false,
    undoRedo: collaboration ? false : undefined,
  }),
  ...(collaboration
    ? [
        Collaboration.configure({
          document: collaboration.provider.document,
          field: "default",
          provider: collaboration.provider,
        }),
        CollaborationCaret.configure({
          provider: collaboration.provider,
          user: collaboration.user,
        }),
      ]
    : []),
  CommentExtension.configure({
    HTMLAttributes: { class: "editor-comment-anchor" },
    onCommentActivated: (commentId) => {
      commentController?.activateThread(commentId || null)
    },
  }),
  Placeholder.configure({
    placeholder: ({ node }) =>
      node.type.name === "heading"
        ? "Heading"
        : "Type / for blocks, or just start writing",
  }),
  TaskList,
  ShadcnTaskItem.configure({ editable, nested: true }),
  TextStyle,
  Link.configure({
    autolink: true,
    defaultProtocol: "https",
    HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
    linkOnPaste: true,
    openOnClick: false,
  }),
  Color,
  BackgroundColor,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  TableOfContents.configure({ onUpdate: onTocUpdate }),
  Details.configure({ HTMLAttributes: { class: "editor-details" }, persist: true }),
  DetailsSummary.configure({ HTMLAttributes: { class: "editor-details-summary" } }),
  DetailsContent.configure({ HTMLAttributes: { class: "editor-details-content" } }),
  ImageBlock.configure({ workspaceId, pageId }),
  VideoBlock,
  EmbedBlock,
  FileBlock,
  BookmarkBlock,
  LinkMention,
  DatabaseBlock.configure({
    currentPageId: pageId,
    editable,
    editorRuntime: databaseEditorRuntime,
    onOpenPage,
    workspaceId,
  }),
  PageBlock.configure({
    currentPageId: pageId,
    onCreatePage,
    onEmbedPage,
    onOpenPage,
    workspaceId,
  }),
  EmojiExtension,
  CodeBlockShiki.configure({
    defaultLanguage: null,
    defaultTheme: "github-dark",
    themes: { light: "github-light", dark: "github-dark" },
  }),
  ColumnsExtension,
  Table.configure({
    cellMinWidth: 180,
    HTMLAttributes: { class: "editor-table" },
    resizable: true,
  }),
  TableRow,
  TableHeader,
  TableCell,
  Typography,
  Markdown.configure({
    markedOptions: { gfm: true },
  }),
  CharacterCount,
  BlockSelection,
  SelectionAiPreview,
  AskAiBlock.configure({ workspaceId }),
  SlashCommand.configure({
    onCreateDatabase: createEditorDatabase,
    onCreatePage,
    onOpenPage,
    workspaceId,
  }),
]
