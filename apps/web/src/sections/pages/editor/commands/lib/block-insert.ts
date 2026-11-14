import { createPositionAnchor } from "../../operations/lib/position-anchor";
import type { Content, Editor, JSONContent, Range } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode, type Schema } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { getSelectedBlockRangesForTarget } from "../../extensions/lib/block-selection";
import { workspaceForView } from "../../extensions/lib/editor-integration";
import { dispatchVerified } from "../../operations/lib/dispatch-verified";
import { Effect } from "effect";

import type { SlashCommandItem } from "../../extensions/components/slash-command";
import {
  blockTemplate,
  createTabsContent as createTabsTemplate,
  type BlockTemplateNode,
} from "@zilobase/page-context";

import type { ToolbarAction, ToolbarAttrs } from "../../toolbar/lib/toolbar";
import type { DragHandleTarget } from "../../toolbar/lib/toolbar";

export type BlockCommandId =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "blockquote"
  | "callout"
  | "tabsBlock"
  | "codeBlock"
  | "blockMath"
  | "tableOfContentsBlock"
  | "details"
  | "columns2"
  | "columns3"
  | "columns4"
  | "horizontalRule"
  | "table"
  | "imageBlock"
  | "videoBlock"
  | "embedBlock"
  | "youtube"
  | "figma"
  | "excalidraw"
  | "miro"
  | "fileBlock"
  | "bookmarkBlock"
  | "pageBlock"
  | "linkPage"
  | "databaseBlock"
  | "meetingBlock"
  | "emoji"
  | "askAi";

export const convertibleBlockIds = new Set<BlockCommandId>([
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "heading4",
  "bulletList",
  "orderedList",
  "taskList",
  "blockquote",
  "callout",
  "tabsBlock",
  "codeBlock",
  "details",
]);

export function canEditEditorStructure(editor: Editor) {
  return (
    !editor.isDestroyed &&
    editor.isEditable &&
    (!editor.view ||
      workspaceForView(editor.view)?.runtimes.get(editor)?.getCapabilities().structural !== false)
  );
}

export function createTabsContent(content: JSONContent[] = [{ type: "paragraph" }]): JSONContent {
  return createTabsTemplate(content as BlockTemplateNode[]) as JSONContent;
}

/** Construct the entire replacement before mutating a transaction. */
export function blockContentForConversion(
  id: BlockCommandId,
  nodes: readonly ProseMirrorNode[],
  schema: Schema,
): ProseMirrorNode[] | null {
  if (!convertibleBlockIds.has(id)) return null;
  if (id === "tabsBlock") {
    try {
      const node = schema.nodeFromJSON(createTabsContent(nodes.map((node) => node.toJSON())));
      node.check();
      return [node];
    } catch {
      return null;
    }
  }
  if (id === "callout") {
    try {
      return [schema.nodes.callout.createChecked(null, [...nodes])];
    } catch {
      return null;
    }
  }
  const blocks: ProseMirrorNode[] = [];
  const containers = new Set([
    "bulletList",
    "orderedList",
    "taskList",
    "listItem",
    "taskItem",
    "blockquote",
    "callout",
    "tabsBlock",
    "tabPanel",
    "details",
    "detailsContent",
  ]);
  let supported = true;
  const collect = (node: ProseMirrorNode) => {
    if (
      node.isTextblock &&
      ["paragraph", "heading", "codeBlock", "detailsSummary"].includes(node.type.name)
    ) {
      blocks.push(node);
    } else if (containers.has(node.type.name)) node.forEach(collect);
    else supported = false;
  };
  nodes.forEach(collect);
  if (!supported || !blocks.length) return null;
  const make = (
    name: string,
    attrs: Record<string, unknown> | null,
    content?: Fragment | ProseMirrorNode[],
  ) => schema.nodes[name].createChecked(attrs, content);
  try {
    if (id === "codeBlock") {
      const text = blocks
        .map((node) =>
          node.textBetween(0, node.content.size, "\n", (leaf) => {
            if (leaf.type.name === "hardBreak") return "\n";
            supported = false;
            return "";
          }),
        )
        .join("\n");
      if (!supported) return null;
      return [make("codeBlock", null, text ? [schema.text(text)] : [])];
    }
    const paragraph = (
      node: ProseMirrorNode,
      type = "paragraph",
      attrs: Record<string, unknown> | null = null,
    ) => {
      const target = schema.nodes[type];
      // Converting code back to rich text retains line breaks as hard breaks.
      const inline: ProseMirrorNode[] = [];
      if (node.type.name === "codeBlock") {
        node.textContent.split("\n").forEach((line, index) => {
          if (index) inline.push(schema.nodes.hardBreak.create());
          if (line) inline.push(schema.text(line));
        });
      } else node.forEach((child) => inline.push(child.mark(target.allowedMarks(child.marks))));
      return make(type, attrs, inline);
    };
    if (id === "paragraph" || id.startsWith("heading")) {
      const heading = id !== "paragraph";
      return blocks.map((node) =>
        paragraph(node, heading ? "heading" : "paragraph", {
          ...node.attrs,
          ...(heading ? { level: Number(id.at(-1)) } : {}),
        }),
      );
    }
    const paragraphs = blocks.map((node) => paragraph(node));
    if (id === "blockquote") return [make("blockquote", null, paragraphs)];
    if (id === "details")
      return [
        make("details", null, [
          paragraph(blocks[0], "detailsSummary"),
          make(
            "detailsContent",
            null,
            paragraphs.slice(1).length ? paragraphs.slice(1) : [make("paragraph", null)],
          ),
        ]),
      ];
    return [
      make(
        id,
        null,
        paragraphs.map((node) => make(id === "taskList" ? "taskItem" : "listItem", null, [node])),
      ),
    ];
  } catch {
    return null;
  }
}

function conversionTransaction(editor: Editor, target: DragHandleTarget, id: BlockCommandId) {
  if (!canEditEditorStructure(editor)) return null;
  const { doc, selection } = editor.state;
  if (target.pos < 0 || target.pos >= doc.content.size || !doc.nodeAt(target.pos)?.eq(target.node))
    return null;
  let selected = getSelectedBlockRangesForTarget(doc, selection.from, selection.to, target.pos);
  const range = selection.$from.blockRange(selection.$to);
  // Nested paragraphs share their own block container, rather than the outer
  // column/quote that document-wide block highlighting treats as one block.
  if (
    !selected.length &&
    range &&
    range.depth > 0 &&
    range.endIndex - range.startIndex > 1 &&
    target.pos >= range.start &&
    target.pos < range.end
  ) {
    let pos = range.start;
    selected = [];
    for (let index = range.startIndex; index < range.endIndex; index++) {
      const node = range.parent.child(index);
      selected.push({ from: pos, to: pos + node.nodeSize });
      pos += node.nodeSize;
    }
  }
  let from = selected[0]?.from ?? target.pos;
  let to = selected.at(-1)?.to ?? target.pos + target.node.nodeSize;
  const nodes: ProseMirrorNode[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (pos >= from && pos + node.nodeSize <= to) {
      nodes.push(node);
      return false;
    }
  });
  let replacement = blockContentForConversion(id, nodes, editor.schema);
  if (!replacement) return null;
  // A partial list can become ordinary blocks by splitting its wrapper, keeping
  // unselected siblings on either side. Other containers must remain valid too.
  let selectionOffset = from;
  for (;;) {
    const $from = doc.resolve(from),
      $to = doc.resolve(to);
    const depth = $from.sharedDepth(to);
    const parent = $from.node(depth);
    if (
      $from.depth === depth &&
      $to.depth === depth &&
      parent.canReplace($from.index(), $to.index(), Fragment.fromArray(replacement))
    )
      break;
    const startIndex = $from.index(depth),
      endIndex = $to.indexAfter(depth);
    let outerFrom = $from.start(depth),
      outerTo = outerFrom;
    parent.forEach((node, _offset, index) => {
      if (index < startIndex) outerFrom += node.nodeSize;
      if (index < endIndex) outerTo += node.nodeSize;
    });
    const before = doc.slice(outerFrom, from).content;
    const after = doc.slice(to, outerTo).content;
    const content = before.append(Fragment.fromArray(replacement)).append(after);
    if (parent.canReplace(startIndex, endIndex, content)) {
      from = outerFrom;
      to = outerTo;
      selectionOffset = from + before.size;
      replacement = [];
      content.forEach((node) => replacement!.push(node));
      break;
    }
    const prefix = doc.slice($from.start(depth), from).content;
    const suffix = doc.slice(to, $to.end(depth)).content;
    if (
      depth === 0 ||
      (prefix.size && !parent.type.validContent(prefix)) ||
      (suffix.size && !parent.type.validContent(suffix))
    )
      return null;
    replacement = [
      ...(prefix.size ? [parent.copy(prefix)] : []),
      ...replacement,
      ...(suffix.size ? [parent.copy(suffix)] : []),
    ];
    from = $from.before(depth);
    to = $to.after(depth);
    selectionOffset = from + (prefix.size ? parent.copy(prefix).nodeSize : 0);
  }
  try {
    const tr = editor.state.tr.replaceWith(from, to, replacement);
    tr.doc.check();
    tr.setSelection(
      TextSelection.near(tr.doc.resolve(Math.min(selectionOffset + 1, tr.doc.content.size))),
    );
    return tr;
  } catch {
    return null;
  }
}

export function canConvertBlocks(editor: Editor, target: DragHandleTarget, id: BlockCommandId) {
  return conversionTransaction(editor, target, id) !== null;
}

export function convertBlocks(editor: Editor, target: DragHandleTarget, id: BlockCommandId) {
  const tr = conversionTransaction(editor, target, id);
  if (!tr) return false;
  const workspace = workspaceForView(editor.view);
  const commit = () => dispatchVerified(editor, tr).applied;
  const applied = workspace ? workspace.history.group([editor], "Turn into", commit) : commit();
  if (applied) editor.view.focus();
  return applied;
}

function blockContentForItem(
  item: Pick<SlashCommandItem, "id">,
  attrs?: { databaseId?: string; meetingId?: string },
): Content | null {
  return blockTemplate(item, attrs) as Content | null;
}

function selectInsertedBlock(editor: Editor, pos: number, item: SlashCommandItem) {
  if (item.id === "blockMath" || item.id === "tableOfContentsBlock") {
    editor.chain().focus().setNodeSelection(pos).run();
    return;
  }
  if (item.id === "tabsBlock") {
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 2)));
        return true;
      })
      .run();
    return;
  }
  if (item.id === "databaseBlock") {
    editor
      .chain()
      .focus()
      .setTextSelection(pos + 2)
      .run();
    return;
  }

  if (item.id === "horizontalRule") {
    editor
      .chain()
      .focus()
      .setTextSelection(pos + 2)
      .run();
    return;
  }

  editor
    .chain()
    .focus()
    .setTextSelection(pos + 1)
    .run();
}

export type StructuralInsertionPendingChange = (pending: boolean) => void;

type StructuralInsertionOptions<T> = {
  create: (() => Promise<T | null>) | undefined;
  insert: (created: T) => void;
  onPendingChange?: StructuralInsertionPendingChange;
};

function structuralInsertion<T>({
  create,
  insert,
  onPendingChange,
}: StructuralInsertionOptions<T>) {
  return Effect.gen(function* () {
    if (!create) return null;
    // This callback stays outside the cleanup region, as in the Promise workflow.
    yield* Effect.try({ try: () => onPendingChange?.(true), catch: (error) => error });
    return yield* Effect.gen(function* () {
      const created = yield* Effect.tryPromise({ try: create, catch: (error) => error });
      if (created !== null) {
        yield* Effect.try({ try: () => insert(created), catch: (error) => error });
      }
      return created;
    }).pipe(
      // Capture the body failure so a throwing finalizer retains JavaScript finally precedence.
      Effect.exit,
      Effect.ensuring(Effect.sync(() => onPendingChange?.(false))),
      Effect.flatMap((exit) => exit),
    );
  });
}

export async function runStructuralInsertion<T>(input: StructuralInsertionOptions<T>) {
  return Effect.runPromise(structuralInsertion(input));
}

export async function insertCreatedBlock<T>({
  editor,
  range,
  create,
  content,
  onPendingChange,
  onInserted,
}: {
  editor: Editor;
  range: { from: number; to: number };
  create: (() => Promise<T | null>) | undefined;
  content: (created: T) => Content;
  onInserted?: (created: T) => void;
  onPendingChange?: StructuralInsertionPendingChange;
}) {
  if (
    editor.isDestroyed ||
    !editor.isEditable ||
    range.from < 0 ||
    range.to < range.from ||
    range.to > editor.state.doc.content.size
  )
    return;
  const from = createPositionAnchor(editor, range.from),
    to = createPositionAnchor(editor, range.to);
  const expected = editor.state.doc.slice(range.from, range.to);
  return Effect.runPromise(
    structuralInsertion({
      create,
      onPendingChange,
      insert: (created) => {
        const start = from.resolve(),
          end = to.resolve();
        if (
          editor.isDestroyed ||
          !editor.isEditable ||
          !canEditEditorStructure(editor) ||
          start === null ||
          end === null ||
          end < start
        )
          return;
        if (!editor.state.doc.slice(start, end).eq(expected)) return;
        const previous = editor.state.doc;
        const applied = editor
          .chain()
          .focus(undefined, { scrollIntoView: false })
          .replaceBlocksRange({ from: start, to: end }, content(created))
          .run();
        if (applied && !editor.state.doc.eq(previous)) onInserted?.(created);
      },
    }).pipe(
      Effect.exit,
      Effect.ensuring(
        Effect.sync(() => {
          from.dispose();
          to.dispose();
        }),
      ),
      Effect.flatMap((exit) => exit),
    ),
  );
}

export async function insertBlockFromPlus(
  editor: Editor,
  target: DragHandleTarget,
  item: SlashCommandItem,
  options: {
    onCreateDatabase?: () => Promise<string | null>;
    onCreateMeeting?: () => Promise<string | null>;
    onStructuralInsertionPendingChange?: StructuralInsertionPendingChange;
  } = {},
) {
  if (
    !canEditEditorStructure(editor) ||
    target.pos < 0 ||
    target.pos >= editor.state.doc.content.size ||
    !editor.state.doc.nodeAt(target.pos)?.eq(target.node)
  )
    return;
  const isEmptyTextBlock = target.node.isTextblock && target.node.content.size === 0;
  const anchor = createPositionAnchor(editor, target.pos);

  const insert = (content: Content | null) => {
    const pos = anchor.resolve();
    if (
      !content ||
      editor.isDestroyed ||
      !editor.isEditable ||
      !canEditEditorStructure(editor) ||
      pos === null ||
      !editor.state.doc.nodeAt(pos)?.eq(target.node)
    ) {
      return;
    }

    if (isEmptyTextBlock) {
      editor
        .chain()
        .focus()
        .replaceBlocksRange({ from: pos, to: pos + target.node.nodeSize }, content)
        .run();
      selectInsertedBlock(editor, pos, item);
      return;
    }

    const insertPos = pos + target.node.nodeSize;

    editor.chain().focus().insertBlocksAt(insertPos, content).run();
    selectInsertedBlock(editor, insertPos, item);
  };

  return Effect.runPromise(
    Effect.gen(function* () {
      if (item.id === "databaseBlock" || item.id === "meetingBlock") {
        const database = item.id === "databaseBlock";
        const outcome = yield* structuralInsertion({
          create: database ? options.onCreateDatabase : options.onCreateMeeting,
          insert: (id) =>
            insert(blockContentForItem(item, database ? { databaseId: id } : { meetingId: id })),
          onPendingChange: options.onStructuralInsertionPendingChange,
        }).pipe(Effect.exit);
        // Resource insertion crossed an await before anchor cleanup, even for missing
        // callbacks or synchronous failures. Keep that boundary without nesting runners.
        yield* Effect.promise(() => Promise.resolve());
        yield* outcome;
        return;
      }

      yield* Effect.try({ try: () => insert(blockContentForItem(item)), catch: (error) => error });
    }).pipe(
      // Preserve finally precedence if disposing the anchor throws after a body failure.
      Effect.exit,
      Effect.ensuring(Effect.sync(() => anchor.dispose())),
      Effect.flatMap((exit) => exit),
    ),
  );
}

export type BlockInsertionOptions = {
  isEnabled?: () => boolean;
  onCreateDatabase?: () => Promise<string | null>;
  onCreateMeeting?: () => Promise<string | null>;
  onCreatePage?: () => Promise<import("../../extensions/components/page-block").CreatedPage>;
  onOpenPage?: (pageId: string) => void;
  onStructuralInsertionPendingChange?: StructuralInsertionPendingChange;
};

/** Slash and toolbar actions share these editor commands; UI labels are presentation only. */
export function runBlockCommand(
  editor: Editor,
  id: BlockCommandId,
  range: Range,
  options: BlockInsertionOptions = {},
): void | Promise<void> {
  if (!canEditEditorStructure(editor) || options.isEnabled?.() === false) return;
  if (
    id === "databaseBlock" ||
    id === "meetingBlock" ||
    (id === "pageBlock" && options.onCreatePage)
  ) {
    return insertCreatedBlock({
      editor,
      range,
      create: (id === "databaseBlock"
        ? options.onCreateDatabase
        : id === "meetingBlock"
          ? options.onCreateMeeting
          : options.onCreatePage) as (() => Promise<string | { id: string } | null>) | undefined,
      content: (resource: string | { id: string }) => {
        if (id === "pageBlock")
          return { type: "pageBlock", attrs: { pageId: (resource as { id: string }).id } };
        return blockContentForItem(
          { id },
          id === "databaseBlock"
            ? { databaseId: resource as string }
            : { meetingId: resource as string },
        )!;
      },
      onPendingChange: options.onStructuralInsertionPendingChange,
      onInserted:
        id === "pageBlock"
          ? (resource) => options.onOpenPage?.((resource as { id: string }).id)
          : undefined,
    }).then(() => undefined);
  }
  const chain = editor.chain().focus().deleteRange(range);
  switch (id) {
    case "paragraph":
      chain.setParagraph().run();
      return;
    case "heading1":
    case "heading2":
    case "heading3":
    case "heading4":
      chain.setHeading({ level: Number(id.at(-1)) as 1 | 2 | 3 | 4 }).run();
      return;
    case "bulletList":
      chain.toggleBulletList().run();
      return;
    case "orderedList":
      chain.toggleOrderedList().run();
      return;
    case "taskList":
      chain.toggleTaskList().run();
      return;
    case "tabsBlock":
      chain.insertTabs().run();
      return;
    case "callout":
      chain.setCallout().run();
      return;
    case "blockquote":
      chain.toggleBlockquote().run();
      return;
    case "codeBlock":
      chain.toggleCodeBlock().run();
      return;
    case "details":
      chain.setDetails().run();
      return;
    case "columns2":
    case "columns3":
    case "columns4":
      chain.setColumns(Number(id.at(-1)), true).run();
      return;
    default: {
      const content = blockContentForItem({ id });
      if (content) chain.insertContent(content).run();
    }
  }
}

const toolbarCommands: Record<
  ToolbarAction,
  (chain: ReturnType<Editor["chain"]>, attrs?: ToolbarAttrs) => void
> = {
  toggleBold: (chain) => chain.toggleBold().run(),
  toggleItalic: (chain) => chain.toggleItalic().run(),
  toggleStrike: (chain) => chain.toggleStrike().run(),
  toggleCode: (chain) => chain.toggleCode().run(),
  toggleUnderline: (chain) => chain.toggleUnderline().run(),
  toggleHeading: (chain, attrs) => chain.toggleHeading({ level: attrs?.level ?? 1 }).run(),
  toggleBulletList: (chain) => chain.toggleBulletList().run(),
  toggleOrderedList: (chain) => chain.toggleOrderedList().run(),
  toggleTaskList: (chain) => chain.toggleTaskList().run(),
  toggleBlockquote: (chain) => chain.toggleBlockquote().run(),
  toggleCodeBlock: (chain) => chain.toggleCodeBlock().run(),
  setDetails: (chain) => chain.setDetails().run(),
  setHorizontalRule: (chain) => chain.setHorizontalRule().run(),
  insertTable: (chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  setTextAlign: (chain, attrs) => chain.setTextAlign(attrs?.align ?? "left").run(),
};

export const runToolbarCommand = (
  editor: Editor | null,
  action: ToolbarAction,
  attrs?: ToolbarAttrs,
) => {
  if (!editor || editor.isDestroyed || !editor.isEditable) return;
  const inlineActions = new Set([
    "toggleBold",
    "toggleItalic",
    "toggleStrike",
    "toggleCode",
    "toggleUnderline",
    "setTextAlign",
  ]);
  if (!inlineActions.has(action) && !canEditEditorStructure(editor)) return;
  toolbarCommands[action](editor.chain().focus(), attrs);
};
