import type { Editor, JSONContent } from "@tiptap/core"
import {
  isStructuralBlockMarkerLine,
  preprocessStructuralBlockMarkdown,
  restoreStructuralBlocksInMarkdownContent,
} from "@notelab/workspace-context"

export type GeneratedRange = {
  from: number
  to: number
}

export function getFullDocumentPreviewRange(editor: Editor): GeneratedRange {
  const doc = editor.state.doc

  if (doc.childCount === 0) {
    return { from: 0, to: 0 }
  }

  return { from: 0, to: doc.content.size }
}

type ParseMarkdownContentOptions = {
  unwrapPlainFencedBlock?: boolean
}

export function parseMarkdownContent(
  editor: Editor,
  markdown: string,
  options?: ParseMarkdownContentOptions,
) {
  const normalizedMarkdown = options?.unwrapPlainFencedBlock
    ? normalizeSelectionReplacementMarkdown(markdown)
    : markdown
  const trimmedMarkdown = normalizeUnsupportedMarkdown(normalizedMarkdown).trim()

  if (!trimmedMarkdown) {
    return null
  }

  const markdownForParse = preprocessStructuralBlockMarkdown(trimmedMarkdown)

  try {
    const doc = editor.markdown?.parse(markdownForParse)
    const content =
      doc?.content && doc.content.length > 0
        ? restoreStructuralBlocksInMarkdownContent(
            sanitizeMarkdownContent(doc.content),
          )
        : restoreStructuralBlocksInMarkdownContent(
            splitStructuralMarkdownLines(trimmedMarkdown),
          )
    const size = editor.schema.nodeFromJSON({
      type: "doc",
      content,
    }).content.size

    return { content, size }
  } catch {
    const content = splitStructuralMarkdownLines(trimmedMarkdown)
    const size = editor.schema.nodeFromJSON({ type: "doc", content }).content.size

    return { content, size }
  }
}

export async function readStreamError(response: Response) {
  const text = await response.text()

  if (!text) {
    return "AI generation failed. Try again."
  }

  try {
    const body = JSON.parse(text) as { error?: string; message?: string }

    return body.message ?? body.error ?? text
  } catch {
    return text
  }
}

export function nextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

export function normalizeSelectionReplacementMarkdown(markdown: string) {
  return unwrapPlainFencedBlock(markdown)
}

function splitStructuralMarkdownLines(markdown: string): JSONContent[] {
  const lines = markdown.split("\n")
  const blocks: JSONContent[] = []
  let paragraphLines: string[] = []

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return
    }

    blocks.push({
      type: "paragraph",
      content: [{ type: "text", text: paragraphLines.join("\n") }],
    })
    paragraphLines = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const isStructuralMarker = isStructuralBlockMarkerLine(trimmed)

    if (isStructuralMarker) {
      flushParagraph()
      blocks.push({
        type: "paragraph",
        content: [{ type: "text", text: trimmed }],
      })
      continue
    }

    if (!trimmed) {
      flushParagraph()
      continue
    }

    paragraphLines.push(line)
  }

  flushParagraph()

  return restoreStructuralBlocksInMarkdownContent(blocks)
}

function sanitizeMarkdownContent(content: JSONContent[]) {
  return content.map(sanitizeMarkdownNode).filter(Boolean) as JSONContent[]
}

function sanitizeMarkdownNode(node: JSONContent): JSONContent | null {
  if (!node.type) {
    return null
  }

  const content = Array.isArray(node.content)
    ? sanitizeMarkdownContent(node.content)
    : undefined

  if (node.type === "listItem" || node.type === "taskItem") {
    return {
      ...node,
      content: normalizeListItemContent(content),
    }
  }

  if (node.type === "blockquote") {
    return {
      ...node,
      content: normalizeRequiredBlockContent(content),
    }
  }

  if (
    node.type === "bulletList" ||
    node.type === "orderedList" ||
    node.type === "taskList"
  ) {
    return {
      ...node,
      content: normalizeListContent(node.type, content),
    }
  }

  if (content) {
    return { ...node, content }
  }

  return node
}

function normalizeRequiredBlockContent(content: JSONContent[] | undefined) {
  return content && content.length > 0 ? content : [{ type: "paragraph" }]
}

function normalizeListContent(
  listType: string,
  content: JSONContent[] | undefined,
) {
  if (content && content.length > 0) {
    return content
  }

  return [
    {
      type: listType === "taskList" ? "taskItem" : "listItem",
      ...(listType === "taskList" ? { attrs: { checked: false } } : {}),
      content: [{ type: "paragraph" }],
    },
  ]
}

function normalizeListItemContent(content: JSONContent[] | undefined) {
  if (!content || content.length === 0) {
    return [{ type: "paragraph" }]
  }

  const firstNode = content[0]

  if (firstNode?.type === "paragraph") {
    return content
  }

  const leadingInlineNodes: JSONContent[] = []
  let firstBlockIndex = 0

  for (const child of content) {
    if (child.type === "text" || child.marks) {
      leadingInlineNodes.push(child)
      firstBlockIndex += 1
      continue
    }

    break
  }

  return [
    {
      type: "paragraph",
      ...(leadingInlineNodes.length ? { content: leadingInlineNodes } : {}),
    },
    ...content.slice(firstBlockIndex),
  ]
}

function normalizeUnsupportedMarkdown(markdown: string) {
  return normalizeFootnotes(markdown)
}

function unwrapPlainFencedBlock(markdown: string) {
  const trimmed = markdown.trim()
  const match = /^```([^\n`]*)\n([\s\S]*?)\n```$/.exec(trimmed)

  if (!match) {
    return markdown
  }

  const language = match[1].trim().toLowerCase()

  if (
    language &&
    language !== "markdown" &&
    language !== "md" &&
    language !== "text" &&
    language !== "plain" &&
    language !== "plaintext"
  ) {
    return markdown
  }

  return match[2].trim()
}

function normalizeFootnotes(markdown: string) {
  const footnotes = new Map<string, string>()
  const withoutDefinitions = markdown.replace(
    /^[ \t]*\[\^([^\]]+)\]:[ \t]*(.*)(?:\n(?!(?:[ \t]*\[\^[^\]]+\]:|[ \t]*$)).*)*/gm,
    (definition) => {
      const match = /^[ \t]*\[\^([^\]]+)\]:[ \t]*(.*)$/m.exec(definition)

      if (match) {
        footnotes.set(
          match[1],
          definition
            .replace(/^[ \t]*\[\^[^\]]+\]:[ \t]*/m, "")
            .replace(/\n[ \t]+/g, " ")
            .trim(),
        )
      }

      return ""
    },
  )

  const withoutRefs = withoutDefinitions.replace(/\[\^([^\]]+)\]/g, (_ref, id) =>
    footnotes.has(id) ? `[${id}]` : "",
  )
  const unusedFootnotes = Array.from(footnotes.entries()).filter(
    ([, value]) => value.length > 0,
  )

  if (unusedFootnotes.length === 0) {
    return withoutRefs
  }

  return [
    withoutRefs.trimEnd(),
    "",
    "### Notes",
    ...unusedFootnotes.map(([id, value]) => `${id}. ${value}`),
  ].join("\n")
}
