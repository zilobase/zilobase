import { Node, mergeAttributes } from "@tiptap/core"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react"
import { useSyncExternalStore } from "react"

import { DATABASE_PAGE_DRAG_MIME } from "./constants"
import { DatabaseTableView } from "./table"
import type { DatabaseBlockOptions } from "./types"

const databasePageDragEvents = new Set([
  "dragstart",
  "dragenter",
  "dragover",
  "dragleave",
  "drop",
  "dragend",
])

function isDatabasePageDragEvent(event: Event) {
  if (!databasePageDragEvents.has(event.type) || !(event instanceof DragEvent)) {
    return false
  }

  return Array.from(event.dataTransfer?.types ?? []).includes(
    DATABASE_PAGE_DRAG_MIME
  )
}

function DatabaseBlockView({ editor, extension, node }: ReactNodeViewProps) {
  const options = extension.options as DatabaseBlockOptions
  const databaseId = node.attrs.databaseId as string | null
  // Subscribe through the editor-owned runtime so this node view updates when read-only mode changes.
  const isEditable = useSyncExternalStore(
    options.editorRuntime?.subscribe ?? (() => () => {}),
    options.editorRuntime?.getEditable ??
      (() => options.editable !== false && editor.isEditable),
    options.editorRuntime?.getEditable ??
      (() => options.editable !== false && editor.isEditable)
  )

  return (
    <NodeViewWrapper
      className="database-block"
      data-database-id={databaseId ?? undefined}
      data-type="databaseBlock"
    >
      <DatabaseTableView
        databaseId={databaseId}
        editable={isEditable}
        onOpenPage={options.onOpenPage}
        organizationId={options.organizationId}
        showExpandButton
      />
    </NodeViewWrapper>
  )
}

export const DatabaseBlock = Node.create<DatabaseBlockOptions>({
  name: "databaseBlock",

  group: "block",

  atom: true,

  draggable: false,

  selectable: true,

  extendNodeSchema(extension) {
    if (extension.name !== this.name) {
      return {}
    }

    return {
      disableDropCursor: (
        _view: unknown,
        _pos: unknown,
        event: DragEvent
      ) => isDatabasePageDragEvent(event),
    }
  },

  addOptions() {
    return {
      currentPageId: null,
      onOpenPage: undefined,
      organizationId: null,
    }
  },

  addAttributes() {
    return {
      databaseId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-database-id"),
        renderHTML: (attributes) =>
          attributes.databaseId ? { "data-database-id": attributes.databaseId } : {},
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="databaseBlock"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "databaseBlock" }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(DatabaseBlockView, {
      stopEvent: ({ event }) => {
        const target = event.target

        if (
          target instanceof HTMLElement &&
          target.closest(".database-block-shell")
        ) {
          return true
        }

        return isDatabasePageDragEvent(event)
      },
    })
  },
})
