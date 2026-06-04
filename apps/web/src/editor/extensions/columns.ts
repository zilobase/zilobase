import { Extension, mergeAttributes, Node } from "@tiptap/core"
import type { JSONContent } from "@tiptap/core"
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model"
import {
  NodeSelection,
  Selection,
  SelectionRange,
  TextSelection,
} from "@tiptap/pm/state"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    columnsExtension: {
      setColumns: (count: number, keepContent?: boolean) => ReturnType
      unsetColumns: () => ReturnType
    }
  }
}

type ParentNodeMatch = {
  depth: number
  node: ProseMirrorNode
  pos: number
  start: number
}

const normalizeColumnWidths = (value: unknown, count: number) => {
  if (
    Array.isArray(value) &&
    value.length === count &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  ) {
    return value as number[]
  }

  return Array.from({ length: count }, () => 100 / count)
}

const times = <T,>(count: number, fn: (index: number) => T) =>
  Array.from({ length: count }, (_, index) => fn(index))

const buildNode = ({ attrs, content, type }: JSONContent) =>
  content ? { attrs, content, type } : { attrs, type }

const buildParagraph = ({ content }: Pick<JSONContent, "content"> = {}) =>
  buildNode({ content, type: "paragraph" })

const buildColumn = ({ content }: Pick<JSONContent, "content"> = {}) =>
  buildNode({ content, type: "column" })

const buildColumnBlock = ({ content }: Pick<JSONContent, "content">) =>
  buildNode({
    attrs: { widths: Array.from({ length: content?.length ?? 2 }, () => 100 / (content?.length ?? 2)) },
    content,
    type: "columnBlock",
  })

const buildNColumns = (count: number) => {
  const content = [buildParagraph({})]

  return times(Math.max(2, count), () => buildColumn({ content }))
}

const findParentNodeClosestToPos = (
  $pos: ResolvedPos,
  predicate: (match: ParentNodeMatch) => boolean,
): ParentNodeMatch => {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth)
    const pos = depth > 0 ? $pos.before(depth) : 0
    const start = $pos.start(depth)

    if (predicate({ depth, node, pos, start })) {
      return {
        depth,
        node,
        pos,
        start,
      }
    }
  }

  throw new Error("no ancestor found")
}

class ColumnSelection extends Selection {
  private resolvedFrom: ResolvedPos
  private resolvedTo: ResolvedPos

  constructor(selection: Selection) {
    super(selection.$from, selection.$to)
    this.resolvedFrom = selection.$from
    this.resolvedTo = selection.$to
  }

  get $from() {
    return this.resolvedFrom
  }

  get $to() {
    return this.resolvedTo
  }

  map() {
    return this
  }

  content() {
    return this.$from.doc.slice(this.from, this.to, true)
  }

  eq(other: Selection) {
    return other instanceof ColumnSelection && other.anchor === this.anchor
  }

  toJSON() {
    return { from: this.from, to: this.to, type: "column" }
  }

  expandSelection(doc: ProseMirrorNode) {
    const where = ({ node, pos }: ParentNodeMatch) => {
      if (node.type.name === Column.name) {
        return true
      }

      return doc.resolve(pos).depth <= 0
    }

    const { pos: fromPos } = findParentNodeClosestToPos(this.$from, where)
    this.resolvedFrom = doc.resolve(fromPos)

    const { node: toNode, pos: toPos } = findParentNodeClosestToPos(
      this.$to,
      where,
    )
    this.resolvedTo = doc.resolve(toPos + toNode.nodeSize)

    if (this.getFirstNode()?.type.name === ColumnBlock.name) {
      const offset = 2
      this.resolvedFrom = doc.resolve(this.$from.pos + offset)
      this.resolvedTo = doc.resolve(this.$to.pos + offset)
    }

    const mutableSelection = this as unknown as {
      $anchor: ResolvedPos
      $head: ResolvedPos
      ranges: SelectionRange[]
    }

    mutableSelection.$anchor = this.resolvedFrom
    mutableSelection.$head = this.resolvedTo
    mutableSelection.ranges = [
      new SelectionRange(this.resolvedFrom, this.resolvedTo),
    ]
  }

  static create(doc: ProseMirrorNode, from: number, to: number) {
    const $from = doc.resolve(from)
    const $to = doc.resolve(to)
    const selection = new TextSelection($from, $to)

    return new ColumnSelection(selection)
  }

  getFirstNode() {
    return this.content().content.firstChild
  }
}

export const Column = Node.create({
  name: "column",

  group: "column",

  content: "(paragraph|block)*",

  isolating: true,

  selectable: false,

  parseHTML() {
    return [{ tag: `div[data-type="${this.name}"]` }]
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = mergeAttributes(HTMLAttributes, {
      class: "column",
      "data-type": this.name,
    })

    return ["div", attrs, 0]
  },
})

export const ColumnBlock = Node.create({
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
          const rawWidths = element.getAttribute("data-widths")

          if (!rawWidths) {
            return null
          }

          try {
            const widths = JSON.parse(rawWidths)

            return Array.isArray(widths) ? widths : null
          } catch {
            return null
          }
        },
        renderHTML: () => ({}),
      },
    }
  },

  addOptions() {
    return {
      columnType: Column,
      nestedColumns: false,
    }
  },

  parseHTML() {
    return [{ tag: `div[data-type="${this.name}"]` }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const widths = normalizeColumnWidths(node.attrs.widths, node.childCount)
    const attrs = mergeAttributes(HTMLAttributes, {
      class: "column-block",
      "data-column-count": node.childCount,
      "data-type": this.name,
      "data-widths": JSON.stringify(widths),
      style: `grid-template-columns: ${widths
        .map((width) => `minmax(0, ${width}fr)`)
        .join(" ")};`,
    })

    return ["div", attrs, 0]
  },

  addCommands() {
    return {
      unsetColumns:
        () =>
        ({ dispatch, tr }) => {
          try {
            if (!dispatch) {
              return false
            }

            const where = ({ node }: ParentNodeMatch) => {
              if (!this.options.nestedColumns && node.type === this.type) {
                return true
              }

              return node.type === this.type
            }
            const firstAncestor = findParentNodeClosestToPos(
              tr.selection.$from,
              where,
            )
            let nodes: ProseMirrorNode[] = []

            firstAncestor.node.descendants((node, _pos, parent) => {
              if (parent?.type.name === Column.name) {
                nodes.push(node)
              }
            })
            nodes = nodes.reverse().filter((node) => node.content.size > 0)

            const resolvedPos = tr.doc.resolve(firstAncestor.pos)
            const selection = new NodeSelection(resolvedPos)
            let nextTr = tr.setSelection(selection)

            nodes.forEach((node) => {
              nextTr = nextTr.insert(firstAncestor.pos, node)
            })
            nextTr = nextTr.deleteSelection()

            dispatch(nextTr)
            return true
          } catch (error) {
            console.error(error)
            return false
          }
        },
      setColumns:
        (count: number, keepContent = false) =>
        ({ dispatch, tr }) => {
          try {
            if (!dispatch) {
              return false
            }

            const selection = new ColumnSelection(tr.selection)
            selection.expandSelection(tr.doc)

            const { openEnd, openStart } = selection.content()

            if (openStart !== openEnd) {
              console.warn("failed depth check")
              return false
            }

            const columnBlock = keepContent
              ? buildColumnBlock({
                  content: [
                    buildColumn({
                      content: selection.content().toJSON()?.content,
                    }),
                    ...buildNColumns(count - 1),
                  ],
                })
              : buildColumnBlock({ content: buildNColumns(count) })
            const newNode = tr.doc.type.schema.nodeFromJSON(columnBlock)
            const parent = selection.$anchor.parent.type
            const canAcceptColumnBlockChild =
              parent.contentMatch.matchType(this.type) &&
              (this.options.nestedColumns || parent.name !== Column.name)

            if (!canAcceptColumnBlockChild) {
              console.warn("content not allowed")
              return false
            }

            dispatch(
              tr
                .setSelection(selection)
                .replaceSelectionWith(newNode, false),
            )
            return true
          } catch (error) {
            console.error(error)
            return false
          }
        },
    }
  },
})

export const ColumnsExtension = Extension.create({
  name: "columnsExtension",

  addExtensions() {
    const extensions = []

    if (this.options.column !== false) {
      extensions.push(Column)
    }

    if (this.options.columnBlock !== false) {
      extensions.push(ColumnBlock)
    }

    return extensions
  },
})

export default ColumnsExtension
