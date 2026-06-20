import { Extension, type JSONContent } from "@tiptap/core"
import {
  DOMSerializer,
  type Node as ProseMirrorNode,
  type Schema,
} from "@tiptap/pm/model"
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

export type SelectionAiPreviewState = {
  generatedContent?: JSONContent[]
  from: number
  generatedMarkdown: string
  isStreaming: boolean
  to: number
}

type SelectionAiPreviewMeta =
  | { preview: SelectionAiPreviewState; type: "set" }
  | { type: "clear" }

export const selectionAiPreviewPluginKey =
  new PluginKey<SelectionAiPreviewState | null>("selectionAiPreview")

export function setSelectionAiPreviewMeta(
  tr: Transaction,
  preview: SelectionAiPreviewState | null,
) {
  return tr.setMeta(
    selectionAiPreviewPluginKey,
    preview ? { type: "set", preview } : { type: "clear" },
  )
}

export const SelectionAiPreview = Extension.create({
  name: "selectionAiPreview",

  addProseMirrorPlugins() {
    return [
      new Plugin<SelectionAiPreviewState | null>({
        key: selectionAiPreviewPluginKey,
        state: {
          init: () => null,
          apply(tr, previous) {
            const meta = tr.getMeta(selectionAiPreviewPluginKey) as
              | SelectionAiPreviewMeta
              | undefined

            if (meta?.type === "clear") {
              return null
            }

            if (meta?.type === "set") {
              return meta.preview
            }

            if (!previous) {
              return null
            }

            return {
              ...previous,
              from: tr.mapping.map(previous.from),
              to: tr.mapping.map(previous.to),
            }
          },
        },
        props: {
          decorations(state) {
            const preview = selectionAiPreviewPluginKey.getState(state)

            if (!preview) {
              return null
            }

            const decorations: Decoration[] = [
              Decoration.inline(preview.from, preview.to, {
                class: "selection-ai-preview-deleted",
              }),
              Decoration.widget(
                getPreviewPosition(state.doc, preview.to),
                () => createInsertedPreview(preview, state.schema),
                {
                  key: [
                    "selection-ai-preview",
                    preview.from,
                    preview.to,
                    preview.isStreaming ? "streaming" : "done",
                    preview.generatedMarkdown,
                  ].join(":"),
                  side: 1,
                },
              ),
            ]

            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})

function createInsertedPreview(
  preview: SelectionAiPreviewState,
  schema: Schema,
) {
  const generatedContent = preview.generatedContent ?? []
  const hasParsedContent = generatedContent.length > 0
  const node = document.createElement("div")
  node.className = "selection-ai-preview-inserted"
  node.contentEditable = "false"

  if (hasParsedContent) {
    const parsedDoc = schema.nodeFromJSON({
      type: "doc",
      content: generatedContent,
    })

    node.appendChild(
      DOMSerializer.fromSchema(schema).serializeFragment(
        parsedDoc.content,
      ) as Node,
    )
  } else {
    node.textContent = preview.generatedMarkdown.trim() || "Writing..."
  }

  if (preview.isStreaming) {
    node.dataset.streaming = "true"
  }

  return node
}

function getPreviewPosition(doc: ProseMirrorNode, position: number) {
  const $position = doc.resolve(position)

  if ($position.parent.inlineContent && $position.depth > 0) {
    return $position.after($position.depth)
  }

  return position
}
