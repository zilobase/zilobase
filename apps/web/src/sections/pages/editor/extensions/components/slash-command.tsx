import { createPositionAnchor } from "../../operations/lib/position-anchor";
import { toast } from "sonner";
import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import {
  AppIconProvider,
  Bookmark,
  CalendarDays,
  CheckSquare,
  Code2,
  CodeXml,
  Columns2,
  Database,
  File,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Image,
  LinkIcon,
  LightbulbIcon,
  ListCollapse,
  List,
  ListOrdered,
  ListTree,
  Minus,
  NotebookTabs,
  Pilcrow,
  Quote,
  SmilePlus,
  Sigma,
  Sparkles,
  Table2,
  Video,
} from "@/components/icons";
import { type ComponentType, type SVGProps } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker";
import { ExcalidrawIcon, FigmaIcon, MiroIcon, YouTubeIcon } from "./embed-block";
import { insertAskAiBlock } from "./ask-ai-block";
import { isFeatureEnabled } from "@/platform/environment";
import {
  runBlockCommand,
  type BlockCommandId,
  type BlockInsertionOptions,
} from "../../commands/lib/block-insert";

import { SlashCommandMenu } from "./slash-command-menu";

type SlashCommandOptions = BlockInsertionOptions & { workspaceId?: string | null };

export type SlashCommandItem = {
  id: BlockCommandId;
  title: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  command: (props: { editor: Editor; range: Range }) => void | Promise<void>;
};

function openSlashEmojiPicker({ editor, range }: { editor: Editor; range: Range }) {
  const coords = editor.view.coordsAtPos(range.from);
  const from = createPositionAnchor(editor, range.from),
    to = createPositionAnchor(editor, range.to, "left");
  const expected = editor.state.doc.slice(range.from, range.to);
  const container = document.createElement("div");
  const root = createRoot(container);

  const cleanup = () => {
    document.removeEventListener("mousedown", handleOutsideMouseDown);
    document.removeEventListener("keydown", handleKeyDown);
    editor.off("destroy", cleanup);
    from.dispose();
    to.dispose();
    root.unmount();
    container.remove();
  };

  const handleOutsideMouseDown = (event: MouseEvent) => {
    if (!container.contains(event.target as Node)) {
      cleanup();
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      cleanup();
      editor.chain().focus().run();
    }
  };

  Object.assign(container.style, {
    left: `${coords.left}px`,
    position: "fixed",
    top: `${coords.bottom + 8}px`,
    zIndex: "60",
  });

  editor.on("destroy", cleanup);
  document.body.appendChild(container);
  document.addEventListener("mousedown", handleOutsideMouseDown);
  document.addEventListener("keydown", handleKeyDown);

  root.render(
    <AppIconProvider>
      <div
        className="overflow-hidden rounded-lg bg-surface-overlay text-content-primary shadow-md ring-1 ring-stroke-default"
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <EmojiPicker
          onEmojiSelect={({ emoji }) => {
            const start = from.resolve(),
              end = to.resolve();
            if (
              !editor.isDestroyed &&
              editor.isEditable &&
              start !== null &&
              end !== null &&
              end >= start &&
              editor.state.doc.slice(start, end).eq(expected)
            ) {
              editor.chain().focus().deleteRange({ from: start, to: end }).insertEmoji(emoji).run();
            }
            cleanup();
          }}
        >
          <EmojiPickerSearch autoFocus placeholder="Search emoji..." />
          <EmojiPickerContent />
          <EmojiPickerFooter />
        </EmojiPicker>
      </div>
    </AppIconProvider>,
  );
}

function createSlashCommandItems(options: SlashCommandOptions = {}): SlashCommandItem[] {
  const items: Array<[BlockCommandId, string, string, ComponentType<SVGProps<SVGSVGElement>>]> = [
    ["paragraph", "Text", "Plain paragraph", Pilcrow],
    ["heading1", "Heading 1", "Large section heading", Heading1],
    ["heading2", "Heading 2", "Medium section heading", Heading2],
    ["heading3", "Heading 3", "Small section heading", Heading3],
    ["heading4", "Heading 4", "Subsection heading", Heading4],
    ["bulletList", "Bullet List", "Simple unordered list", List],
    ["orderedList", "Numbered List", "Ordered list", ListOrdered],
    ["taskList", "Task List", "Checkbox to-dos", CheckSquare],
    ["columns2", "2 Columns", "Two side-by-side sections", Columns2],
    ["columns3", "3 Columns", "Three side-by-side sections", Columns2],
    ["columns4", "4 Columns", "Four side-by-side sections", Columns2],
    ["blockquote", "Quote", "Call out a passage", Quote],
    ["callout", "Callout", "Icon container for any blocks", LightbulbIcon],
    ["tabsBlock", "Tabs", "Organize nested blocks into tabs", NotebookTabs],
    ["codeBlock", "Code Block", "Multiline code snippet", Code2],
    ["blockMath", "TeX equation", "Display a LaTeX math formula", Sigma],
    ["tableOfContentsBlock", "Table of contents", "TOC with links to page headings", ListTree],
    ["imageBlock", "Image", "Upload or link media", Image],
    ["videoBlock", "Video", "Embed or upload a video", Video],
    ["embedBlock", "Embed", "Embed a URL or iframe", CodeXml],
    ["youtube", "YouTube", "Embed a YouTube video", YouTubeIcon],
    ["figma", "Figma", "Embed a Figma file or prototype", FigmaIcon],
    ["excalidraw", "Excalidraw", "Embed an Excalidraw drawing", ExcalidrawIcon],
    ["miro", "Miro", "Embed a Miro board", MiroIcon],
    ["fileBlock", "File", "Upload or link a file", File],
    ["bookmarkBlock", "Bookmark", "Save a visual web link", Bookmark],
    ["pageBlock", "Page", "Nested page", NotebookTabs],
    ["linkPage", "Link to page", "Link an existing page", LinkIcon],
    ["emoji", "Emoji", "Insert inline emoji", SmilePlus],
    ["details", "Toggle", "Collapsible content", ListCollapse],
    ["horizontalRule", "Divider", "Horizontal rule", Minus],
    ["table", "Table", "3 by 3 table", Table2],
    ["meetingBlock", "Meeting notes", "Record, transcribe, and summarize a meeting", CalendarDays],
    ["databaseBlock", "Database", "Table where every row is a page", Database],
  ];
  if (isFeatureEnabled("askAi"))
    items.unshift(["askAi", "Ask AI", "Generate content with AI", Sparkles]);
  return items.map(([id, title, description, icon]) => ({
    id,
    title,
    description,
    icon,
    command: ({ editor, range }) => {
      if (!editor.isEditable || options.isEnabled?.() === false) return;
      if (id === "emoji") return openSlashEmojiPicker({ editor, range });
      if (id === "askAi") return insertAskAiBlock({ editor, range });
      return runBlockCommand(editor, id, range, options);
    },
  }));
}

export const slashCommandItems = createSlashCommandItems();

const SLASH_MENU_HEIGHT = 288;
const SLASH_MENU_EMPTY_HEIGHT = 72;
const SLASH_MENU_ITEM_HEIGHT = 58;
const SLASH_MENU_VERTICAL_PADDING = 8;
const SLASH_MENU_WIDTH = 288;
const SLASH_MENU_OFFSET = 6;
const SLASH_MENU_COLLISION_PADDING = 16;

function getSlashCommandMenuHeight(itemCount: number) {
  if (itemCount === 0) {
    return SLASH_MENU_EMPTY_HEIGHT;
  }

  return Math.min(
    SLASH_MENU_HEIGHT,
    itemCount * SLASH_MENU_ITEM_HEIGHT + SLASH_MENU_VERTICAL_PADDING,
  );
}

function getSlashCommandMenuPosition(anchorRect: DOMRect | null, itemCount: number) {
  if (!anchorRect || typeof window === "undefined") {
    return {
      left: SLASH_MENU_COLLISION_PADDING,
      top: SLASH_MENU_COLLISION_PADDING,
    };
  }

  const menuHeight = getSlashCommandMenuHeight(itemCount);
  const spaceBelow = window.innerHeight - anchorRect.bottom - SLASH_MENU_COLLISION_PADDING;
  const spaceAbove = anchorRect.top - SLASH_MENU_COLLISION_PADDING;
  const shouldOpenAbove = spaceBelow < menuHeight + SLASH_MENU_OFFSET && spaceAbove > spaceBelow;
  const maxLeft = Math.max(
    SLASH_MENU_COLLISION_PADDING,
    window.innerWidth - SLASH_MENU_WIDTH - SLASH_MENU_COLLISION_PADDING,
  );
  const left = Math.min(Math.max(anchorRect.left, SLASH_MENU_COLLISION_PADDING), maxLeft);
  const preferredTop = shouldOpenAbove
    ? anchorRect.top - menuHeight - SLASH_MENU_OFFSET
    : anchorRect.bottom + SLASH_MENU_OFFSET;
  const maxTop = Math.max(
    SLASH_MENU_COLLISION_PADDING,
    window.innerHeight - menuHeight - SLASH_MENU_COLLISION_PADDING,
  );
  const top = Math.min(Math.max(preferredTop, SLASH_MENU_COLLISION_PADDING), maxTop);

  return {
    left,
    top,
  };
}

function SlashCommandPopover({
  anchorRect,
  items,
  selectedIndex,
  selectItem,
  setSelectedIndex,
}: {
  anchorRect: DOMRect | null;
  items: SlashCommandItem[];
  selectedIndex: number;
  selectItem: (index: number) => void;
  setSelectedIndex: (index: number) => void;
}) {
  const position = getSlashCommandMenuPosition(anchorRect, items.length);

  return (
    <div
      className="fixed z-50 w-72 overflow-hidden rounded-xl border bg-surface-overlay text-content-primary shadow-md"
      onMouseDown={(event) => event.preventDefault()}
      style={position}
    >
      <SlashCommandMenu
        items={items}
        setSelectedIndex={setSelectedIndex}
        selectedIndex={selectedIndex}
        selectItem={selectItem}
      />
    </div>
  );
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return {
      onCreateDatabase: undefined,
      onCreateMeeting: undefined,
      onCreatePage: undefined,
      onOpenPage: undefined,
      onStructuralInsertionPendingChange: undefined,
      workspaceId: undefined,
    };
  },

  addProseMirrorPlugins() {
    const items = createSlashCommandItems(this.options);

    return [
      Suggestion<SlashCommandItem, SlashCommandItem>({
        editor: this.editor,
        char: "/",
        allow: ({ editor }) => editor.isEditable && this.options.isEnabled?.() !== false,
        startOfLine: true,
        command: ({ editor, range, props }) => {
          void Promise.resolve(props.command({ editor, range })).catch((error) =>
            toast.error(error instanceof Error ? error.message : "Could not insert block."),
          );
        },
        items: ({ query }) => {
          return items.filter((item) => {
            const search = `${item.title} ${item.description}`.toLowerCase();

            return search.includes(query.toLowerCase());
          });
        },
        render: () => {
          let element: HTMLDivElement;
          let root: Root;
          let props: SuggestionProps<SlashCommandItem, SlashCommandItem>;
          let selectedIndex = 0;
          let keydownHandler: ((event: KeyboardEvent) => void) | null = null;

          const selectItem = (index: number) => {
            const item = props.items[index];

            if (item) {
              props.command(item);
            }
          };

          const renderMenu = () => {
            const rect = props.clientRect?.() ?? null;

            root.render(
              <AppIconProvider>
                <SlashCommandPopover
                  anchorRect={rect}
                  items={props.items}
                  setSelectedIndex={(index) => {
                    selectedIndex = index;
                    renderMenu();
                  }}
                  selectedIndex={selectedIndex}
                  selectItem={selectItem}
                />
              </AppIconProvider>,
            );
          };

          const moveSelection = (direction: 1 | -1) => {
            if (props.items.length === 0) {
              return;
            }

            selectedIndex = (selectedIndex + props.items.length + direction) % props.items.length;
            renderMenu();
          };

          const handleMenuKeyDown = (event: KeyboardEvent) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              event.stopPropagation();
              moveSelection(-1);
              return true;
            }

            if (event.key === "ArrowDown") {
              event.preventDefault();
              event.stopPropagation();
              moveSelection(1);
              return true;
            }

            if (event.key === "Home") {
              event.preventDefault();
              event.stopPropagation();
              selectedIndex = 0;
              renderMenu();
              return true;
            }

            if (event.key === "End") {
              event.preventDefault();
              event.stopPropagation();
              selectedIndex = Math.max(props.items.length - 1, 0);
              renderMenu();
              return true;
            }

            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              event.stopPropagation();
              selectItem(selectedIndex);
              return true;
            }

            return false;
          };

          return {
            onStart: (nextProps) => {
              props = nextProps;
              selectedIndex = 0;
              element = document.createElement("div");
              document.body.appendChild(element);
              root = createRoot(element);
              keydownHandler = (event) => {
                handleMenuKeyDown(event);
              };
              window.addEventListener("keydown", keydownHandler, true);
              renderMenu();
            },
            onUpdate: (nextProps) => {
              props = nextProps;
              selectedIndex = Math.min(selectedIndex, props.items.length - 1);
              selectedIndex = Math.max(selectedIndex, 0);
              renderMenu();
            },
            onKeyDown: ({ event }: SuggestionKeyDownProps) => {
              if (event.key === "Escape") {
                return false;
              }

              return handleMenuKeyDown(event);
            },
            onExit: () => {
              if (keydownHandler) {
                window.removeEventListener("keydown", keydownHandler, true);
              }
              root.unmount();
              element.remove();
            },
          };
        },
      }),
    ];
  },
});
