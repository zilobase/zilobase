import { Node, mergeAttributes } from "@tiptap/core"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react"
import { useSyncExternalStore } from "react"

import { DATABASE_PAGE_DRAG_MIME } from "./database-contracts"
import { DatabaseView } from "../views/database-view"
import type { DatabaseBlockOptions } from "./database-contracts"

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

function DatabaseBlockView({
  editor,
  extension,
  node,
  updateAttributes,
}: ReactNodeViewProps) {
  const options = extension.options as DatabaseBlockOptions
  const databaseId = node.attrs.databaseId as string | null
  const setupMode = node.attrs.setupMode === true
  const showTitle = node.attrs.showTitle !== false
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
      data-show-title={showTitle ? undefined : "false"}
      data-type="databaseBlock"
    >
      <DatabaseView
        databaseId={databaseId}
        editable={isEditable}
        onOpenPage={options.onOpenPage}
        onDismissSetup={() => updateAttributes({ setupMode: false })}
        onSetupComplete={() => updateAttributes({ setupMode: false })}
        onShowTitleChange={(nextShowTitle) =>
          updateAttributes({ showTitle: nextShowTitle })
        }
        workspaceId={options.workspaceId}
        setupMode={setupMode}
        showExpandButton
        showTitle={showTitle}
        pageId={options.currentPageId}
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
      workspaceId: null,
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
      showTitle: {
        default: true,
        parseHTML: (element) =>
          element.getAttribute("data-show-title") !== "false",
        renderHTML: (attributes) =>
          attributes.showTitle === false ? { "data-show-title": "false" } : {},
      },
      setupMode: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute("data-setup-mode") === "true",
        renderHTML: (attributes) =>
          attributes.setupMode ? { "data-setup-mode": "true" } : {},
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
      className: "database-block",
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
