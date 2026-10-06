import { Extension, mergeAttributes, Node } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode, type ResolvedPos } from "@tiptap/pm/model";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    columnsExtension: {
      setColumns: (count: number, keepContent?: boolean) => ReturnType;
      unsetColumns: () => ReturnType;
    };
  }
}

type ParentNodeMatch = {
  depth: number;
  node: ProseMirrorNode;
  pos: number;
  start: number;
};

const normalizeColumnWidths = (value: unknown, count: number) => {
  if (
    Array.isArray(value) &&
    value.length === count &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  ) {
    return value as number[];
  }

  return Array.from({ length: count }, () => 100 / count);
};

const times = <T>(count: number, fn: (index: number) => T) =>
  Array.from({ length: count }, (_, index) => fn(index));

const buildNode = ({ attrs, content, type }: JSONContent) =>
  content ? { attrs, content, type } : { attrs, type };

const buildParagraph = ({ content }: Pick<JSONContent, "content"> = {}) =>
  buildNode({ content, type: "paragraph" });

const buildColumn = ({ content }: Pick<JSONContent, "content"> = {}) =>
  buildNode({ content, type: "column" });

const buildColumnBlock = ({ content }: Pick<JSONContent, "content">) =>
  buildNode({
    attrs: {
      widths: Array.from({ length: content?.length ?? 2 }, () => 100 / (content?.length ?? 2)),
    },
    content,
    type: "columnBlock",
  });

const buildNColumns = (count: number) => {
  const content = [buildParagraph({})];

  return times(Math.max(2, count), () => buildColumn({ content }));
};

const findParentNodeClosestToPos = (
  $pos: ResolvedPos,
  predicate: (match: ParentNodeMatch) => boolean,
): ParentNodeMatch => {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    const pos = depth > 0 ? $pos.before(depth) : 0;
    const start = $pos.start(depth);

    if (predicate({ depth, node, pos, start })) {
      return {
        depth,
        node,
        pos,
        start,
      };
    }
  }

  throw new Error("no ancestor found");
};

const Column = Node.create({
  name: "column",

  group: "column",

  content: "(paragraph|block)*",

  isolating: true,

  selectable: false,

  parseHTML() {
    return [{ tag: `div[data-type="${this.name}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = mergeAttributes(HTMLAttributes, {
      class: "column",
      "data-type": this.name,
    });

    return ["div", attrs, 0];
  },
});

const ColumnBlock = Node.create({
  name: "columnBlock",

  group: "block",

  content: "column{2,}",

  isolating: true,

  selectable: true,

  addAttributes() {
    return {
      widths: {
        default: null,
        parseHTML: (element) => {
          const rawWidths = element.getAttribute("data-widths");

          if (!rawWidths) {
            return null;
          }

          try {
            const widths = JSON.parse(rawWidths);

            return Array.isArray(widths) ? widths : null;
          } catch {
            return null;
          }
        },
        renderHTML: () => ({}),
      },
    };
  },

  addOptions() {
    return {
      columnType: Column,
      nestedColumns: false,
    };
  },

  parseHTML() {
    return [{ tag: `div[data-type="${this.name}"]` }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const widths = normalizeColumnWidths(node.attrs.widths, node.childCount);
    const attrs = mergeAttributes(HTMLAttributes, {
      class: "column-block",
      "data-column-count": node.childCount,
      "data-type": this.name,
      "data-widths": JSON.stringify(widths),
      style: `grid-template-columns: ${widths.map((width) => `minmax(0, ${width}fr)`).join(" ")};`,
    });

    return ["div", attrs, 0];
  },

  addCommands() {
    return {
      unsetColumns:
        () =>
        ({ dispatch, tr }) => {
          try {
            const selected = tr.doc.nodeAt(tr.selection.from);
            const match =
              selected?.type === this.type
                ? { node: selected, pos: tr.selection.from }
                : findParentNodeClosestToPos(
                    tr.selection.$from,
                    ({ node }) => node.type === this.type,
                  );
            const children: ProseMirrorNode[] = [];
            match.node.forEach((column) => column.forEach((child) => children.push(child)));
            const content = children.length
              ? children
              : [tr.doc.type.schema.nodes.paragraph.create()];
            const $pos = tr.doc.resolve(match.pos);
            if (
              !$pos.parent.canReplace($pos.index(), $pos.index() + 1, Fragment.fromArray(content))
            )
              return false;
            if (dispatch) tr.replaceWith(match.pos, match.pos + match.node.nodeSize, content);
            return true;
          } catch {
            return false;
          }
        },
      setColumns:
        (count, keepContent = false) =>
        ({ dispatch, tr }) => {
          if (!Number.isInteger(count) || count < 2) return false;
          const range = tr.selection.$from.blockRange(tr.selection.$to);
          if (!range || (!this.options.nestedColumns && range.parent.type.name === Column.name))
            return false;
          const selected = tr.doc.slice(range.start, range.end);
          const content = keepContent ? selected.toJSON()?.content : undefined;
          const block = keepContent
            ? buildColumnBlock({ content: [buildColumn({ content }), ...buildNColumns(count - 1)] })
            : buildColumnBlock({ content: buildNColumns(count) });
          const node = tr.doc.type.schema.nodeFromJSON(block);
          if (!range.parent.canReplaceWith(range.startIndex, range.endIndex, this.type))
            return false;
          if (dispatch) tr.replaceWith(range.start, range.end, node);
          return true;
        },
    };
  },
});

export const ColumnsExtension = Extension.create({
  name: "columnsExtension",

  addExtensions() {
    const extensions = [];

    if (this.options.column !== false) {
      extensions.push(Column);
    }

    if (this.options.columnBlock !== false) {
      extensions.push(ColumnBlock);
    }

    return extensions;
  },
});
