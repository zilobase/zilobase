type ProseMirrorNode = {
  attrs?: Record<string, unknown>
  content?: ProseMirrorNode[]
  marks?: Array<{ attrs?: Record<string, unknown>; type: string }>
  text?: string
  type?: string
}

type BlockSerializer = (node: ProseMirrorNode) => string

export function prosemirrorToMarkdown(content: unknown): string {
  if (content === null || content === undefined) {
    return ""
  }

  if (typeof content === "string") {
    return content.trim()
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => prosemirrorToMarkdown(item))
      .filter(Boolean)
      .join("\n\n")
      .trim()
  }

  if (typeof content !== "object") {
    return ""
  }

  const node = content as ProseMirrorNode

  if (node.type === "doc") {
    return serializeBlocks(node.content ?? [])
  }

  return serializeBlocks([node]).trim()
}

function serializeBlocks(nodes: ProseMirrorNode[]) {
  const parts: string[] = []

  for (const node of nodes) {
    const serialized = serializeBlock(node)

    if (serialized) {
      parts.push(serialized)
    }
  }

  return parts.join("\n\n").trim()
}

function stringAttr(
  attrs: Record<string, unknown> | undefined,
  key: string,
): string {
  return typeof attrs?.[key] === "string" ? attrs[key] : ""
}

function trimmedStringAttr(
  attrs: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
): string {
  const value = stringAttr(attrs, key).trim()
  return value || fallback
}

function serializeParagraph(node: ProseMirrorNode) {
  return serializeInline(node.content ?? [])
}

function serializeHeading(node: ProseMirrorNode) {
  const level =
    typeof node.attrs?.level === "number"
      ? Math.min(Math.max(node.attrs.level, 1), 6)
      : 1

  return `${"#".repeat(level)} ${serializeInline(node.content ?? [])}`.trim()
}

function serializeBlockquote(node: ProseMirrorNode) {
  return (node.content ?? [])
    .map((child) => `> ${serializeBlock(child)}`)
    .join("\n")
}

function serializeCodeBlock(node: ProseMirrorNode) {
  const language = stringAttr(node.attrs, "language")
  const code = serializeInline(node.content ?? [])
  return `\`\`\`${language}\n${code}\n\`\`\``.trim()
}

function serializeDatabaseBlock(node: ProseMirrorNode) {
  const databaseId = stringAttr(node.attrs, "databaseId")
  const label = databaseId ? `Database (${databaseId})` : "Database"
  return `[${label}]`
}

function serializePageBlock(node: ProseMirrorNode) {
  const pageId = stringAttr(node.attrs, "pageId")
  const title = trimmedStringAttr(node.attrs, "title", "Untitled page")
  return pageId ? `[Page: ${title} (${pageId})]` : `[Page: ${title}]`
}

function serializeImageBlock(node: ProseMirrorNode) {
  const src = stringAttr(node.attrs, "src")
  const alt = trimmedStringAttr(node.attrs, "alt", "image")
  return src ? `![${alt}](${src})` : `![${alt}]`
}

function serializeVideoBlock(node: ProseMirrorNode) {
  const src = stringAttr(node.attrs, "src")
  return src ? `[Video](${src})` : "[Video]"
}

function serializeEmbedBlock(node: ProseMirrorNode) {
  const url = stringAttr(node.attrs, "url")
  const title = trimmedStringAttr(node.attrs, "title", "Embed")
  return url ? `[${title}](${url})` : `[${title}]`
}

function serializeFileBlock(node: ProseMirrorNode) {
  const name = trimmedStringAttr(node.attrs, "name", "File")
  const url = stringAttr(node.attrs, "url")
  return url ? `[File: ${name}](${url})` : `[File: ${name}]`
}

function serializeBookmarkBlock(node: ProseMirrorNode) {
  const url = stringAttr(node.attrs, "url")
  const title = trimmedStringAttr(node.attrs, "title", url || "Bookmark")
  return url ? `[${title}](${url})` : `[${title}]`
}

function serializeLinkMention(node: ProseMirrorNode) {
  const href = stringAttr(node.attrs, "href")
  const title = trimmedStringAttr(node.attrs, "title", href || "Link")
  return href ? `[${title}](${href})` : title
}

function serializeDetailsSummary(node: ProseMirrorNode) {
  const summary = serializeInline(node.content ?? [])
  const body = serializeBlocks(
    (node as ProseMirrorNode & { parentContent?: ProseMirrorNode[] })
      .content ?? [],
  )
  return summary ? `**${summary}**\n${body}`.trim() : body
}

function serializeNestedBlocks(node: ProseMirrorNode) {
  return serializeBlocks(node.content ?? [])
}

function serializeDefaultBlock(node: ProseMirrorNode) {
  if (node.content?.length) {
    return serializeBlocks(node.content)
  }

  return serializeInline(node.content ?? [])
}

const BLOCK_SERIALIZERS: Record<string, BlockSerializer> = {
  blockquote: serializeBlockquote,
  bookmarkBlock: serializeBookmarkBlock,
  bulletList: (node) => serializeList(node.content ?? [], "- "),
  codeBlock: serializeCodeBlock,
  column: serializeNestedBlocks,
  columnBlock: serializeNestedBlocks,
  columnsExtension: serializeNestedBlocks,
  databaseBlock: serializeDatabaseBlock,
  details: serializeNestedBlocks,
  detailsContent: serializeNestedBlocks,
  detailsSummary: serializeDetailsSummary,
  embedBlock: serializeEmbedBlock,
  fileBlock: serializeFileBlock,
  heading: serializeHeading,
  horizontalRule: () => "---",
  imageBlock: serializeImageBlock,
  linkMention: serializeLinkMention,
  orderedList: (node) => serializeOrderedList(node.content ?? []),
  pageBlock: serializePageBlock,
  paragraph: serializeParagraph,
  table: (node) => serializeTable(node.content ?? []),
  taskList: (node) => serializeTaskList(node.content ?? []),
  text: (node) => applyMarks(node.text ?? "", node.marks ?? []),
  videoBlock: serializeVideoBlock,
}

function serializeBlock(node: ProseMirrorNode): string {
  const serializer = node.type ? BLOCK_SERIALIZERS[node.type] : undefined
  return serializer ? serializer(node) : serializeDefaultBlock(node)
}

function serializeList(nodes: ProseMirrorNode[], marker: string) {
  return nodes
    .map((node) => {
      if (node.type !== "listItem" && node.type !== "taskItem") {
        return serializeBlock(node)
      }

      const content = serializeBlocks(node.content ?? [])
      return `${marker}${content}`
    })
    .join("\n")
}

function serializeOrderedList(nodes: ProseMirrorNode[]) {
  return nodes
    .map((node, index) => {
      if (node.type !== "listItem") {
        return serializeBlock(node)
      }

      const content = serializeBlocks(node.content ?? [])
      return `${index + 1}. ${content}`
    })
    .join("\n")
}

function serializeTaskList(nodes: ProseMirrorNode[]) {
  return nodes
    .map((node) => {
      const checked = node.attrs?.checked === true
      const content = serializeBlocks(node.content ?? [])
      return `- [${checked ? "x" : " "}] ${content}`
    })
    .join("\n")
}

function serializeTable(rows: ProseMirrorNode[]) {
  const tableRows = rows
    .filter((row) => row.type === "tableRow")
    .map((row) =>
      (row.content ?? [])
        .filter((cell) => cell.type === "tableCell" || cell.type === "tableHeader")
        .map((cell) => serializeInline(cell.content ?? []).replace(/\|/g, "\\|")),
    )

  if (tableRows.length === 0) {
    return ""
  }

  const header = tableRows[0]
  const divider = header.map(() => "---")
  const body = tableRows.slice(1)

  return [
    `| ${header.join(" | ")} |`,
    `| ${divider.join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n")
}

function serializeInline(nodes: ProseMirrorNode[]) {
  return nodes
    .map((node) => {
      if (node.type === "hardBreak") {
        return "\n"
      }

      if (node.type === "text") {
        return applyMarks(node.text ?? "", node.marks ?? [])
      }

      if (node.type === "emoji") {
        return typeof node.attrs?.emoji === "string" ? node.attrs.emoji : ""
      }

      return serializeBlock(node)
    })
    .join("")
}

function applyMarks(
  text: string,
  marks: Array<{ attrs?: Record<string, unknown>; type: string }>,
) {
  return marks.reduce((current, mark) => {
    switch (mark.type) {
      case "bold":
      case "strong":
        return `**${current}**`
      case "italic":
      case "em":
        return `*${current}*`
      case "strike":
        return `~~${current}~~`
      case "code":
        return `\`${current}\``
      case "link": {
        const href =
          typeof mark.attrs?.href === "string" ? mark.attrs.href : undefined
        return href ? `[${current}](${href})` : current
      }
      default:
        return current
    }
  }, text)
}