import { Extension, type JSONContent } from "@tiptap/core"
import DiffMatchPatch, {
  DIFF_DELETE,
  DIFF_EQUAL,
  DIFF_INSERT,
} from "diff-match-patch"
import { type Node as ProseMirrorNode, type Schema } from "@tiptap/pm/model"
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

export type SelectionAiPreviewState = {
  baselineContent?: JSONContent[]
  baselineMarkdown?: string
  generatedContent?: JSONContent[]
  from: number
  generatedMarkdown: string
  isStreaming: boolean
  to: number
  useBeforeBaseline?: boolean
}

type SelectionAiPreviewMeta =
  | { preview: SelectionAiPreviewState; type: "set" }
  | { type: "clear" }

export const selectionAiPreviewPluginKey =
  new PluginKey<SelectionAiPreviewState | null>("selectionAiPreview")

const diffMatchPatch = new DiffMatchPatch()
const blockSeparator = "\n\n"
const leafText = "\n"

type TextPositionSegment = {
  from: number
  textEnd: number
  textStart: number
  to: number
}

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

            return DecorationSet.create(
              state.doc,
              createInlineDiffDecorations(preview, state.doc, state.schema),
            )
          },
        },
      }),
    ]
  },
})

function createInlineDiffDecorations(
  preview: SelectionAiPreviewState,
  doc: ProseMirrorNode,
  schema: Schema,
) {
  if (preview.useBeforeBaseline && preview.baselineMarkdown) {
    return createBaselineAnchoredDiffDecorations(preview, doc, schema)
  }

  return createDocumentAnchoredDiffDecorations(preview, doc, schema)
}

function createDocumentAnchoredDiffDecorations(
  preview: SelectionAiPreviewState,
  doc: ProseMirrorNode,
  schema: Schema,
) {
  const sourceText = createTextPositionMap(doc, preview.from, preview.to)
  const generatedText = getGeneratedPreviewText(preview, schema)
  const decorations: Decoration[] = []

  if (!generatedText) {
    if (preview.isStreaming) {
      decorations.push(
        Decoration.widget(
          preview.to,
          () => createInsertionWidget("Writing..."),
          { key: "selection-ai-preview-writing", side: 1 },
        ),
      )
    }

    return decorations
  }

  const diffs = diffMatchPatch.diff_main(
    sourceText.text,
    generatedText,
    true,
  )
  diffMatchPatch.diff_cleanupSemantic(diffs)
  let originalOffset = 0

  diffs.forEach(([operation, text], index) => {
    if (!text) {
      return
    }

    if (operation === DIFF_DELETE) {
      decorations.push(
        ...getRangesForTextSpan(
          sourceText.segments,
          originalOffset,
          originalOffset + text.length,
        ).map((range) =>
          Decoration.inline(range.from, range.to, {
            class: "selection-ai-preview-diff-deleted",
          }),
        ),
      )
      originalOffset += text.length
      return
    }

    if (operation === DIFF_INSERT) {
      decorations.push(
        Decoration.widget(
          getPositionForTextOffset(
            sourceText.segments,
            originalOffset,
            preview,
          ),
          () => createInsertionWidget(text, preview.isStreaming),
          {
            key: [
              "selection-ai-preview-insert",
              index,
              originalOffset,
              text,
              preview.isStreaming ? "streaming" : "done",
            ].join(":"),
            side: 1,
          },
        ),
      )
      return
    }

    if (operation === DIFF_EQUAL) {
      originalOffset += text.length
    }
  })

  return decorations
}

function createBaselineAnchoredDiffDecorations(
  preview: SelectionAiPreviewState,
  doc: ProseMirrorNode,
  schema: Schema,
) {
  const generatedTextMap = createTextPositionMap(doc, preview.from, preview.to)
  const baselineText = getBaselinePreviewText(preview, schema)
  const generatedText = getGeneratedPreviewText(preview, schema)
  const decorations: Decoration[] = []

  if (!baselineText || !generatedText) {
    return decorations
  }

  const diffs = diffMatchPatch.diff_main(baselineText, generatedText, true)
  diffMatchPatch.diff_cleanupSemantic(diffs)
  let generatedOffset = 0

  diffs.forEach(([operation, text], index) => {
    if (!text) {
      return
    }

    if (operation === DIFF_DELETE) {
      decorations.push(
        Decoration.widget(
          getPositionForTextOffset(
            generatedTextMap.segments,
            generatedOffset,
            preview,
          ),
          () => createDiffWidget(text, "deleted", preview.isStreaming),
          {
            key: [
              "selection-ai-preview-baseline-delete",
              index,
              generatedOffset,
              text,
            ].join(":"),
            side: -1,
          },
        ),
      )
      return
    }

    if (operation === DIFF_INSERT) {
      decorations.push(
        ...getRangesForTextSpan(
          generatedTextMap.segments,
          generatedOffset,
          generatedOffset + text.length,
        ).map((range) =>
          Decoration.inline(range.from, range.to, {
            class: "selection-ai-preview-diff-inserted",
          }),
        ),
      )
      generatedOffset += text.length
      return
    }

    if (operation === DIFF_EQUAL) {
      generatedOffset += text.length
    }
  })

  return decorations
}

function createDiffWidget(
  text: string,
  variant: "deleted" | "inserted",
  isStreaming = false,
) {
  const part = document.createElement("span")
  part.className =
    variant === "deleted"
      ? "selection-ai-preview-diff-deleted"
      : "selection-ai-preview-diff-inserted"
  part.contentEditable = "false"
  part.textContent = text

  if (isStreaming) {
    part.dataset.streaming = "true"
  }

  return part
}

function createInsertionWidget(text: string, isStreaming = false) {
  return createDiffWidget(text, "inserted", isStreaming)
}

function getBaselinePreviewText(
  preview: SelectionAiPreviewState,
  schema: Schema,
) {
  const baselineContent = preview.baselineContent ?? []

  if (baselineContent.length > 0) {
    const parsedDoc = schema.nodeFromJSON({
      type: "doc",
      content: baselineContent,
    })

    return parsedDoc
      .textBetween(0, parsedDoc.content.size, blockSeparator, leafText)
      .trim()
  }

  return preview.baselineMarkdown?.trim() ?? ""
}

function getGeneratedPreviewText(
  preview: SelectionAiPreviewState,
  schema: Schema,
) {
  const generatedContent = preview.generatedContent ?? []

  if (generatedContent.length === 0) {
    return preview.generatedMarkdown.trim()
  }

  const parsedDoc = schema.nodeFromJSON({
    type: "doc",
    content: generatedContent,
  })

  return parsedDoc
    .textBetween(0, parsedDoc.content.size, blockSeparator, leafText)
    .trim()
}

function createTextPositionMap(
  doc: ProseMirrorNode,
  from: number,
  to: number,
) {
  let text = ""
  let firstBlock = true
  const segments: TextPositionSegment[] = []

  doc.nodesBetween(from, to, (node, position) => {
    const nodeText = getNodeText(node, position, from, to)

    if (node.isBlock && (node.isTextblock || (node.isLeaf && nodeText))) {
      if (firstBlock) {
        firstBlock = false
      } else {
        text += blockSeparator
      }
    }

    if (!nodeText) {
      return
    }

    const textStart = text.length
    text += nodeText

    if (node.isText) {
      const textFrom = Math.max(from, position)
      const textTo = textFrom + nodeText.length
      segments.push({
        from: textFrom,
        textEnd: text.length,
        textStart,
        to: textTo,
      })
      return
    }

    if (node.isLeaf) {
      segments.push({
        from: position,
        textEnd: text.length,
        textStart,
        to: position + node.nodeSize,
      })
    }
  })

  if (segments.length === 0 && text.length === 0) {
    segments.push({ from, textEnd: 0, textStart: 0, to })
  }

  return { segments, text }
}

function getNodeText(
  node: ProseMirrorNode,
  position: number,
  from: number,
  to: number,
) {
  if (node.isText) {
    return (
      node.text?.slice(Math.max(from, position) - position, to - position) ??
      ""
    )
  }

  if (node.isLeaf) {
    return leafText
  }

  return ""
}

function getRangesForTextSpan(
  segments: TextPositionSegment[],
  fromOffset: number,
  toOffset: number,
) {
  return segments.flatMap((segment) => {
    const from = Math.max(fromOffset, segment.textStart)
    const to = Math.min(toOffset, segment.textEnd)

    if (from >= to) {
      return []
    }

    return {
      from: segment.from + from - segment.textStart,
      to: segment.from + to - segment.textStart,
    }
  })
}

function getPositionForTextOffset(
  segments: TextPositionSegment[],
  offset: number,
  preview: SelectionAiPreviewState,
) {
  const containingSegment = segments.find(
    (segment) => offset >= segment.textStart && offset <= segment.textEnd,
  )

  if (containingSegment) {
    return containingSegment.from + offset - containingSegment.textStart
  }

  const previousSegment = [...segments]
    .reverse()
    .find((segment) => segment.textEnd <= offset)

  if (previousSegment) {
    return previousSegment.to
  }

  return segments[0]?.from ?? preview.from
}
