import { blockBackgroundProps } from "../lib/block-background";
import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { useEffect, useState } from "react";

import { closeEditorHistory } from "../../runtime/lib/editor-history-coordinator";
import { canEditEditorStructure, createTabsContent } from "../../commands/lib/block-insert";

import { toast } from "sonner";
import { workspaceForView } from "../lib/editor-integration";
import { getNavigationItemPath } from "@/app/routing/route-identifiers";
import { IconEmojiPicker } from "@/components/ui/icon-emoji-picker";
import { PageIconDisplay } from "@/sections/pages/appearance/components/page-icon";

import { Copy, Pencil, Plus, Smile, Trash2 } from "@/components/icons";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/app-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerTrigger,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
} from "@/components/ui/dropdrawer";

// Active panels are local presentation state. Every panel remains in the document
// and in the editor DOM, including when it is hidden or the editor is read-only.
type TabsState = { active: Map<number, number>; scope: string };
const tabsKey = new PluginKey<TabsState>("editor-tabs");
const panelId = (scope: string, pos: number, index: number) => `${scope}-${pos}-${index}`;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tabsBlock: { insertTabs: () => ReturnType };
  }
}

function TabsBlockView({ editor, node, getPos }: ReactNodeViewProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) => {
      const pos = getPos();
      const local = tabsKey.getState(editor.state);
      return {
        editable: canEditEditorStructure(editor),
        index: local?.active.get(pos ?? -1) ?? 0,
        scope: local?.scope ?? "tabs",
      };
    },
  });
  const [menuIndex, setMenuIndex] = useState<number | null>(null);
  const [tabsReady, setTabsReady] = useState(false);
  useEffect(() => {
    // Tiptap first renders node views in a detached element. Base UI registers
    // connected tab buttons, so mount that control after ProseMirror attaches it.
    const frame = requestAnimationFrame(() => setTabsReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const index = Math.min(state.index, node.childCount - 1);
  const pos = getPos();
  let protectedContent = false;
  node.child(index).descendants((child) => {
    if (["databaseBlock", "meetingBlock"].includes(child.type.name)) protectedContent = true;
  });
  const select = (next: number) => {
    const currentPos = getPos();
    if (currentPos === undefined || editor.isDestroyed) return;
    const current = editor.state.doc.nodeAt(currentPos);
    if (current?.type.name !== "tabsBlock" || next < 0 || next >= current.childCount) return;
    let offset = currentPos + 1;
    for (let i = 0; i < next; i++) offset += current.child(i).nodeSize;
    setMenuIndex(null);
    const tr = editor.state.tr.setMeta(tabsKey, { pos: currentPos, index: next });
    tr.setSelection(TextSelection.near(tr.doc.resolve(offset + 1)));
    editor.view.dispatch(tr);
  };
  const change = (action: "add" | "rename" | "icon" | "remove", value = "") => {
    const currentPos = getPos();
    if (currentPos === undefined || editor.isDestroyed || !canEditEditorStructure(editor)) return;
    const current = editor.state.doc.nodeAt(currentPos);
    if (current?.type.name !== "tabsBlock") return;
    const selected = Math.min(index, current.childCount - 1);
    let offset = currentPos + 1;
    for (let i = 0; i < selected; i++) offset += current.child(i).nodeSize;
    if (action === "remove" && (current.childCount <= 1 || protectedContent)) return;
    if (action !== "rename") closeEditorHistory(editor);
    const tr = editor.state.tr;
    if (action === "rename" || action === "icon") {
      tr.setNodeMarkup(offset, undefined, {
        ...current.child(selected).attrs,
        [action === "rename" ? "title" : "icon"]: value,
      });
    } else if (action === "add") {
      const panel = editor.schema.nodes.tabPanel.createAndFill({
        title: `Tab ${current.childCount + 1}`,
      });
      if (!panel) return;
      const end = currentPos + current.nodeSize - 1;
      tr.insert(end, panel).setMeta(tabsKey, { pos: currentPos, index: current.childCount });
      tr.setSelection(TextSelection.near(tr.doc.resolve(end + 1)));
    } else {
      tr.delete(offset, offset + current.child(selected).nodeSize);
      const next = Math.min(selected, current.childCount - 2);
      tr.setMeta(tabsKey, { pos: currentPos, index: next });
      let nextOffset = currentPos + 1;
      const updated = tr.doc.nodeAt(currentPos)!;
      for (let i = 0; i < next; i++) nextOffset += updated.child(i).nodeSize;
      tr.setSelection(TextSelection.near(tr.doc.resolve(nextOffset + 1)));
      setMenuIndex(null);
    }
    editor.view.dispatch(tr);
    if (action !== "rename") closeEditorHistory(editor);
  };

  const copyLink = () => {
    // Stamp a stable link identity on legacy editable panels. Read-only legacy
    // panels use a positional anchor without mutating the document.
    const currentPos = getPos();
    if (currentPos === undefined || editor.isDestroyed) return;
    const current = editor.state.doc.nodeAt(currentPos);
    if (current?.type.name !== "tabsBlock" || index >= current.childCount) return;
    const tab = current.child(index);
    let tabId = typeof tab.attrs.tabId === "string" ? tab.attrs.tabId : "";
    if (!tabId && canEditEditorStructure(editor)) {
      tabId = crypto.randomUUID();
      let offset = currentPos + 1;
      for (let i = 0; i < index; i++) offset += current.child(i).nodeSize;
      editor.view.dispatch(
        editor.state.tr
          .setNodeMarkup(offset, undefined, { ...tab.attrs, tabId })
          .setMeta("addToHistory", false),
      );
    }
    const pageId = workspaceForView(editor.view)?.runtimes.get(editor)?.getSession().pageId;
    const url = new URL(
      pageId ? getNavigationItemPath({ pageId }) : window.location.href,
      window.location.origin,
    );
    url.hash = `editor-tab=${encodeURIComponent(tabId || `at:${currentPos}:${index}`)}`;
    void (async () => {
      try {
        await navigator.clipboard.writeText(url.href);
      } catch {
        toast.error("Could not copy tab link.");
        return;
      }
      toast.success("Tab link copied.");
    })();
  };

  return (
    <NodeViewWrapper
      className="editor-tabs"
      {...blockBackgroundProps(node.attrs.backgroundColor)}
      data-type="tabsBlock"
    >
      <div
        className="editor-tabs-header"
        contentEditable={false}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {tabsReady ? (
          <Tabs
            value={index}
            onValueChange={(value) => select(Number(value))}
            gap="none"
            className="min-w-0"
          >
            <TabsList overflow="scroll" aria-label="Content tabs">
              {Array.from({ length: node.childCount }, (_, i) => {
                const active = i === index;
                const name = node.child(i).attrs.title || `Tab ${i + 1}`;
                return (
                  <DropDrawer
                    key={i}
                    open={menuIndex === i}
                    onOpenChange={(open) => setMenuIndex(open ? i : null)}
                  >
                    <DropDrawerTrigger asChild>
                      {/* As in database views, keep Radix's anchor ref separate
                        from the Base UI tab's stateful ref. */}
                      <div className="inline-flex shrink-0">
                        <TabsTrigger
                          value={i}
                          width="content"
                          id={`${panelId(state.scope, pos ?? 0, i)}-tab`}
                          aria-controls={panelId(state.scope, pos ?? 0, i)}
                          aria-haspopup="menu"
                          aria-expanded={menuIndex === i}
                          onPointerDownCapture={(event) => {
                            if (active || event.button !== 0) return;
                            event.preventDefault();
                            event.stopPropagation();
                            select(i);
                          }}
                          onKeyDownCapture={(event) => {
                            if (active || (event.key !== "Enter" && event.key !== " ")) return;
                            event.preventDefault();
                            event.stopPropagation();
                            select(i);
                          }}
                          onClick={(event) => {
                            if (active) return;
                            event.preventDefault();
                            event.stopPropagation();
                            select(i);
                          }}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            select(i);
                            setMenuIndex(i);
                          }}
                        >
                          {node.child(i).attrs.icon ? (
                            <PageIconDisplay size="sm" value={node.child(i).attrs.icon} />
                          ) : null}
                          <span className="truncate">{name}</span>
                        </TabsTrigger>
                      </div>
                    </DropDrawerTrigger>
                    <DropDrawerContent
                      align="start"
                      onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        const currentPos = getPos();
                        if (currentPos !== undefined && !editor.isDestroyed)
                          document
                            .getElementById(`${panelId(state.scope, currentPos, i)}-tab`)
                            ?.focus({ preventScroll: true });
                      }}
                    >
                      <DropDrawerItem onSelect={copyLink}>
                        <Copy />
                        Copy link
                      </DropDrawerItem>
                      <DropDrawerSub displayMode="inline" title="Rename tab">
                        <DropDrawerSubTrigger disabled={!state.editable}>
                          <Pencil />
                          Rename
                        </DropDrawerSubTrigger>
                        <DropDrawerSubContent>
                          <div className="p-2">
                            <Input
                              aria-label="Tab name"
                              autoFocus
                              value={node.child(i).attrs.title}
                              onChange={(event) => change("rename", event.target.value)}
                              onKeyDown={(event) => {
                                event.stopPropagation();
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  setMenuIndex(null);
                                }
                              }}
                            />
                          </div>
                        </DropDrawerSubContent>
                      </DropDrawerSub>
                      <DropDrawerSub displayMode="inline" title="Edit tab icon">
                        <DropDrawerSubTrigger disabled={!state.editable}>
                          <Smile />
                          Edit icon
                        </DropDrawerSubTrigger>
                        <DropDrawerSubContent
                          padding="none"
                          width="auto"
                          className="overflow-hidden"
                        >
                          <IconEmojiPicker
                            allowUpload={false}
                            onRemove={
                              node.child(i).attrs.icon
                                ? () => {
                                    change("icon", "");
                                    setMenuIndex(null);
                                  }
                                : undefined
                            }
                            onEmojiSelect={(icon) => {
                              change("icon", icon);
                              setMenuIndex(null);
                            }}
                            onIconSelect={(icon) => {
                              change("icon", icon);
                              setMenuIndex(null);
                            }}
                          />
                        </DropDrawerSubContent>
                      </DropDrawerSub>
                      <DropDrawerItem
                        variant="destructive"
                        disabled={!state.editable || node.childCount <= 1 || protectedContent}
                        title={
                          protectedContent
                            ? "Remove embedded databases or meetings before deleting this tab"
                            : undefined
                        }
                        onSelect={() => change("remove")}
                      >
                        <Trash2 />
                        Delete
                      </DropDrawerItem>
                    </DropDrawerContent>
                  </DropDrawer>
                );
              })}
            </TabsList>
          </Tabs>
        ) : null}
        {state.editable ? (
          <Button size="icon" variant="ghost" aria-label="Add tab" onClick={() => change("add")}>
            <Plus />
          </Button>
        ) : null}
      </div>
      <NodeViewContent className="editor-tabs-content" data-tabs-content="" />
    </NodeViewWrapper>
  );
}

export const TabPanel = Node.create({
  name: "tabPanel",
  content: "block+",
  defining: true,
  isolating: true,
  selectable: false,
  addAttributes() {
    return {
      tabId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-tab-id"),
        renderHTML: (attrs) => (attrs.tabId ? { "data-tab-id": attrs.tabId } : {}),
      },
      icon: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-tab-icon") ?? "",
        renderHTML: (attrs) => ({ "data-tab-icon": attrs.icon }),
      },
      title: {
        default: "Tab",
        parseHTML: (element) => element.getAttribute("data-tab-title") ?? "Tab",
        renderHTML: (attrs) => ({ "data-tab-title": attrs.title }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'section[data-type="tabPanel"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-type": "tabPanel",
        class: "editor-tab-panel",
        role: "tabpanel",
      }),
      0,
    ];
  },
  renderMarkdown(node, helpers) {
    return `### ${node.attrs?.title || "Tab"}\n\n${helpers.renderChildren(node.content ?? [], "\n\n")}`;
  },
});

export const TabsBlock = Node.create({
  name: "tabsBlock",
  group: "block",
  content: "tabPanel+",
  defining: true,
  isolating: true,
  parseHTML() {
    return [{ tag: 'div[data-type="tabsBlock"]', contentElement: "[data-tabs-content]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "tabsBlock", class: "editor-tabs" }),
      ["div", { "data-tabs-content": "", class: "editor-tabs-content" }, 0],
    ];
  },
  renderMarkdown(node, helpers) {
    return helpers.renderChildren(node.content ?? [], "\n\n");
  },
  addCommands() {
    return {
      insertTabs:
        () =>
        ({ chain }) => {
          if (!canEditEditorStructure(this.editor)) return false;
          return chain()
            .insertContent(createTabsContent())
            .command(({ tr }) => {
              const { $from } = tr.selection;
              for (let depth = $from.depth; depth > 0; depth--) {
                if ($from.node(depth).type !== this.type) continue;
                tr.setSelection(TextSelection.near(tr.doc.resolve($from.before(depth) + 2)));
                break;
              }
              return true;
            })
            .run();
        },
    };
  },
  addKeyboardShortcuts() {
    return {
      "Mod-Enter": () =>
        this.editor.commands.command(({ state, tr, dispatch }) => {
          if (!this.editor.isEditable) return false;
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            if ($from.node(depth).type.name === "callout") return false;
            if ($from.node(depth).type !== this.type) continue;
            const after = $from.after(depth);
            const $after = state.doc.resolve(after);
            const paragraph = state.schema.nodes.paragraph;
            if (!$after.parent.canReplaceWith($after.index(), $after.index(), paragraph))
              return false;
            if (dispatch)
              tr.insert(after, paragraph.create())
                .setSelection(TextSelection.near(tr.doc.resolve(after + 1)))
                .scrollIntoView();
            return true;
          }
          return false;
        }),
    };
  },
  addProseMirrorPlugins() {
    const thisEditor = this.editor;
    return [
      new Plugin<TabsState>({
        key: tabsKey,
        state: {
          init: () => ({ active: new Map(), scope: `tabs-${crypto.randomUUID()}` }),
          apply(tr, previous) {
            const active = new Map<number, number>();
            for (const [pos, index] of previous.active) {
              const mapped = tr.mapping.mapResult(pos, 1);
              if (!mapped.deleted && tr.doc.nodeAt(mapped.pos)?.type.name === "tabsBlock")
                active.set(mapped.pos, index);
            }
            const requested = tr.getMeta(tabsKey) as { pos: number; index: number } | undefined;
            if (requested) active.set(requested.pos, requested.index);
            else if (tr.selectionSet) {
              // Keyboard navigation, undo and search must reveal the selected panel.
              const { $from } = tr.selection;
              for (let depth = $from.depth; depth > 0; depth--) {
                if ($from.node(depth).type.name === "tabsBlock")
                  active.set($from.before(depth), $from.index(depth));
              }
            }
            return { active, scope: previous.scope };
          },
        },
        appendTransaction(transactions, _previous, state) {
          if (!canEditEditorStructure(thisEditor) || !transactions.some((tr) => tr.docChanged))
            return null;
          const seen = new Set<string>();
          const tr = state.tr;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== "tabPanel") return;
            const id = typeof node.attrs.tabId === "string" ? node.attrs.tabId : "";
            if (id && !seen.has(id)) {
              seen.add(id);
              return;
            }
            const tabId = crypto.randomUUID();
            seen.add(tabId);
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, tabId });
          });
          return tr.steps.length ? tr.setMeta("addToHistory", false) : null;
        },
        view(view) {
          let frame = 0;
          let resolvedHash: string | null = null;
          const reveal = () => {
            if (resolvedHash === window.location.hash) return;
            let target: string;
            try {
              target = decodeURIComponent(window.location.hash.replace(/^#editor-tab=/, ""));
            } catch {
              return;
            }
            if (!window.location.hash.startsWith("#editor-tab=")) return;
            let found: number | null = null;
            view.state.doc.descendants((node, pos) => {
              if (node.type.name !== "tabsBlock") return;
              node.forEach((child, offset, index) => {
                if (child.attrs.tabId === target || target === `at:${pos}:${index}`)
                  found = pos + 1 + offset;
              });
            });
            if (found === null) return;
            resolvedHash = window.location.hash;
            view.dispatch(
              view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(found + 1))),
            );
            view.nodeDOM(found)?.parentElement?.scrollIntoView({ block: "nearest" });
          };
          const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(reveal);
          };
          window.addEventListener("hashchange", schedule);
          schedule();
          return {
            update(current, previous) {
              if (!current.state.doc.eq(previous.doc)) schedule();
            },
            destroy() {
              cancelAnimationFrame(frame);
              window.removeEventListener("hashchange", schedule);
            },
          };
        },
        props: {
          decorations(state) {
            const local = tabsKey.getState(state)!;
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== "tabsBlock") return;
              const selected = Math.min(local.active.get(pos) ?? 0, node.childCount - 1);
              node.forEach((child, offset, index) => {
                const id = panelId(local.scope, pos, index);
                decorations.push(
                  Decoration.node(pos + 1 + offset, pos + 1 + offset + child.nodeSize, {
                    id,
                    "aria-labelledby": `${id}-tab`,
                    ...(index === selected ? {} : { hidden: "", style: "display: none;" }),
                  }),
                );
              });
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(TabsBlockView);
  },
});
