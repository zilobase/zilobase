import { StructuralCommands } from "./structural-commands";
import { BlockBackground } from "./block-background";
import { PendingPageEmbeds } from "./pending-page-embed";
import { EditorIntegration } from "./editor-integration";
import type { EditorWorkspace } from "../../runtime/lib/editor-workspace";
import CharacterCount from "@tiptap/extension-character-count";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import { TableOfContents, type TableOfContentDataItem } from "@tiptap/extension-table-of-contents";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import { Markdown } from "@tiptap/markdown";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import { BackgroundColor, Color, TextStyle } from "@tiptap/extension-text-style";
import Typography from "@tiptap/extension-typography";
import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Collaboration, { isChangeOrigin } from "@tiptap/extension-collaboration";
import UniqueID from "@tiptap/extension-unique-id";
import { BLOCK_ID_ATTRIBUTE, BLOCK_ID_TYPES } from "@zilobase/page-context";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { AskAiBlock } from "../components/ask-ai-block";
import { BookmarkBlock } from "../components/bookmark-block";
import { TabsBlock, TabPanel } from "../components/tabs-block";
import { Callout } from "../components/callout";
import { CodeBlockShiki } from "../components/code-block-shiki";
import { TexBlock } from "../components/tex-block";
import { TableOfContentsBlock } from "../components/table-of-contents-block";
import { ColumnsExtension } from "./columns";
import { CommentExtension } from "./comment-extension";
import { DatabaseBlock } from "../components/database-block";
import { type DatabaseBlockEditorRuntime } from "@/sections/databases/blocks/lib/database-block-contracts";
import { EmbedBlock } from "../components/embed-block";
import { EmojiExtension } from "../components/emoji";
import { FileBlock } from "../components/file-block";
import { ImageBlock } from "../components/image-block";
import { LinkMention } from "../components/link-mention";
import { MeetingBlock } from "../meeting/components/meeting-extension";
import { MeetingTranscriptPreview } from "./meeting-transcript-preview";
import { PageBlock, type CreatedPage } from "../components/page-block";
import { BlockSelection } from "./block-selection";
import { ShadcnTaskItem } from "../components/shadcn-task-item";
import { SlashCommand } from "../components/slash-command";
import { VideoBlock } from "../components/video-block";
import type { OpenPageOptions } from "@/sections/pages/navigation/hooks/page-navigation";
import type { StructuralInsertionPendingChange } from "../../commands/lib/block-insert";

/**
 * With collaboration, IDs are created on the first Yjs sync so they are added
 * to the synced document rather than the empty initial one. The stock
 * extension waits for a provider "synced" event, but the caret extension's
 * provider here only carries awareness.
 */
const BlockIds = UniqueID.extend({
  addStorage() {
    return { needsInitialIdGeneration: false };
  },
  onCreate() {
    const collaboration = this.editor.extensionManager.extensions.find(
      ({ name }) => name === "collaboration",
    )?.options as { document?: import("yjs").Doc; field?: string } | undefined;
    if (!collaboration) {
      (this as unknown as { parent?: () => void }).parent?.();
      return;
    }
    if (!this.options.updateDocument) return;
    // A later first sync is handled by the plugin. Content is only stamped now if the
    // shared document already has it: stamping the empty placeholder would write a
    // stray paragraph into every page.
    this.storage.needsInitialIdGeneration = true;
    if (!collaboration.document?.getXmlFragment(collaboration.field ?? "default").length) return;
    const { state, view } = this.editor;
    const types = new Set(this.options.types === "all" ? [] : this.options.types);
    const { tr } = state;
    state.doc.descendants((node, pos) => {
      if (types.has(node.type.name) && node.attrs[this.options.attributeName] === null)
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          [this.options.attributeName]: this.options.generateID({ node, pos }),
        });
    });
    if (tr.steps.length) view.dispatch(tr.setMeta("addToHistory", false));
  },
});

export type BaseExtensionsOptions = {
  workspace: EditorWorkspace;
  collaboration?: import("../../lib/editor-types").EditorCollaboration;
  collaborationField?: string;
  createEditorDatabase: () => Promise<string | null>;
  createEditorMeeting: () => Promise<string | null>;
  databaseEditorRuntime: DatabaseBlockEditorRuntime;
  editable: boolean;
  structuralEditingEnabled: boolean;
  isStructuralEditingEnabled?: () => boolean;
  onCreatePage?: () => Promise<CreatedPage>;
  onEmbedPage?: import("../../lib/editor-types").EditorResourceLink;
  onOpenPage?: (pageId: string, options?: OpenPageOptions) => void;
  onStructuralInsertionPendingChange?: StructuralInsertionPendingChange;
  onTocUpdate: (items: TableOfContentDataItem[]) => void;
  workspaceId?: string | null;
  pageId?: string | null;
};

export const createBaseExtensions = ({
  workspace,
  collaboration,
  collaborationField = "default",
  createEditorDatabase,
  createEditorMeeting,
  databaseEditorRuntime,
  editable,
  structuralEditingEnabled,
  isStructuralEditingEnabled,
  onCreatePage,
  onEmbedPage,
  onOpenPage,
  onStructuralInsertionPendingChange,
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
          document: collaboration.document,
          field: collaborationField,
        }),
        ...((collaboration.awareness ?? collaboration.provider?.awareness) && collaboration.user
          ? [
              CollaborationCaret.configure({
                provider: {
                  awareness: collaboration.awareness ?? collaboration.provider?.awareness,
                },
                user: collaboration.user,
              }),
            ]
          : []),
      ]
    : []),
  PendingPageEmbeds,
  StructuralCommands,
  BlockBackground,
  CommentExtension.configure({
    HTMLAttributes: { class: "editor-comment-anchor" },
  }),
  Placeholder.configure({
    placeholder: ({ node }) =>
      node.type.name === "heading" ? "Heading" : "Type / for blocks, or just start writing",
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
  TableOfContentsBlock,
  Details.configure({ HTMLAttributes: { class: "editor-details" }, persist: true }),
  DetailsSummary.configure({ HTMLAttributes: { class: "editor-details-summary" } }),
  DetailsContent.configure({ HTMLAttributes: { class: "editor-details-content" } }),
  ImageBlock.configure({ workspaceId, pageId }),
  VideoBlock,
  EmbedBlock,
  FileBlock,
  BookmarkBlock,
  TexBlock,
  LinkMention,
  DatabaseBlock.configure({
    currentPageId: pageId,
    editable,
    editorRuntime: databaseEditorRuntime,
    onOpenPage,
    workspaceId,
  }),
  MeetingBlock.configure({
    editable,
    editorRuntime: databaseEditorRuntime,
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
  Callout,
  TabsBlock,
  TabPanel,
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
  MeetingTranscriptPreview,
  AskAiBlock.configure({ workspaceId }),
  // Stable block IDs for AI anchors and citations; remote collaboration changes keep their IDs.
  BlockIds.configure({
    attributeName: BLOCK_ID_ATTRIBUTE,
    types: [...BLOCK_ID_TYPES],
    filterTransaction: (transaction) => !isChangeOrigin(transaction),
    updateDocument: editable,
  }),
  ...(structuralEditingEnabled
    ? [
        SlashCommand.configure({
          isEnabled: isStructuralEditingEnabled,
          onCreateDatabase: createEditorDatabase,
          onCreateMeeting: createEditorMeeting,
          onCreatePage,
          onOpenPage,
          onStructuralInsertionPendingChange,
          workspaceId,
        }),
      ]
    : []),
  EditorIntegration.configure({ workspace }),
];
