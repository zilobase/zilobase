type MarkdownContentNode = {
  attrs?: Record<string, unknown>
  content?: MarkdownContentNode[]
  marks?: Array<{ attrs?: Record<string, unknown>; type: string }>
  text?: string
  type?: string
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const DATABASE_MARKER =
  /^\[Database(?:\s*\(([^)]+)\))?\]$/i
const PAGE_WITH_ID_MARKER =
  /^\[Page:\s*(.+?)\s*\(([0-9a-f-]{36})\)\]$/i
const PAGE_MARKER = /^\[Page:\s*(.+?)\]$/i
const VIDEO_MARKER = /^\[Video\]\(([^)]+)\)$/i
const FILE_MARKER = /^\[File:\s*(.+?)\]\(([^)]+)\)$/i
const IMAGE_MARKER = /^!\[([^\]]*)\]\(([^)]+)\)$/i

export function isStructuralBlockMarkerLine(line: string) {
  const trimmed = line.trim()

  if (!trimmed) {
    return false
  }

  return Boolean(matchStructuralBlockText(trimmed))
}

export function preprocessStructuralBlockMarkdown(markdown: string) {
  return markdown
    .split("\n")
    .map((line) => {
      const trimmed = line.trim()

      if (!isStructuralBlockMarkerLine(trimmed)) {
        return line
      }

      const block = matchStructuralBlockText(trimmed)

      if (!block) {
        return line
      }

      return structuralBlockToHtml(block)
    })
    .join("\n")
}

export function restoreStructuralBlocksInMarkdownContent<T extends MarkdownContentNode>(
  content: T[],
): T[] {
  const restored: T[] = []

  for (const node of content) {
    const structuralBlock = matchStructuralBlockNode(node)

    if (structuralBlock) {
      restored.push(structuralBlock)
      continue
    }

    restored.push(node)
  }

  return restored
}

function matchStructuralBlockNode<T extends MarkdownContentNode>(
  node: T,
): T | null {
  if (node.type !== "paragraph") {
    return null
  }

  const plainText = readPlainParagraphText(node)

  if (plainText) {
    const fromText = matchStructuralBlockText(plainText)

    if (fromText) {
      return fromText as unknown as T
    }
  }

  const fromLink = matchStructuralLinkParagraph(node)

  if (fromLink) {
    return fromLink as unknown as T
  }

  return null
}

function matchStructuralBlockText(text: string) {
  const trimmed = text.trim()

  if (!trimmed) {
    return null
  }

  const databaseMatch = DATABASE_MARKER.exec(trimmed)

  if (databaseMatch) {
    const databaseId = databaseMatch[1]?.trim() ?? null

    return {
      attrs: {
        databaseId: databaseId && UUID_PATTERN.test(databaseId) ? databaseId : null,
        showTitle: true,
      },
      type: "databaseBlock",
    }
  }

  const pageWithIdMatch = PAGE_WITH_ID_MARKER.exec(trimmed)

  if (pageWithIdMatch) {
    return {
      attrs: {
        pageId: pageWithIdMatch[2],
      },
      type: "pageBlock",
    }
  }

  const pageMatch = PAGE_MARKER.exec(trimmed)

  if (pageMatch) {
    return {
      attrs: {
        pageId: null,
      },
      type: "pageBlock",
    }
  }

  const videoMatch = VIDEO_MARKER.exec(trimmed)

  if (videoMatch) {
    return {
      attrs: {
        src: videoMatch[1].trim(),
        title: null,
      },
      type: "videoBlock",
    }
  }

  if (trimmed.toLowerCase() === "[video]") {
    return {
      attrs: {
        src: null,
        title: null,
      },
      type: "videoBlock",
    }
  }

  const fileMatch = FILE_MARKER.exec(trimmed)

  if (fileMatch) {
    return {
      attrs: {
        href: fileMatch[2].trim(),
        title: fileMatch[1].trim(),
      },
      type: "fileBlock",
    }
  }

  const imageMatch = IMAGE_MARKER.exec(trimmed)

  if (imageMatch) {
    return {
      attrs: {
        alt: imageMatch[1] || null,
        src: imageMatch[2].trim(),
        title: null,
      },
      type: "imageBlock",
    }
  }

  return null
}

function matchStructuralLinkParagraph<T extends MarkdownContentNode>(node: T) {
  const textNode = node.content?.find((entry) => entry.type === "text")

  if (!textNode || node.content?.length !== 1) {
    return null
  }

  const linkMark = textNode.marks?.find((mark) => mark.type === "link")
  const href =
    typeof linkMark?.attrs?.href === "string" ? linkMark.attrs.href.trim() : ""

  if (!href) {
    return null
  }

  const label = (textNode.text ?? "").trim()

  if (label.toLowerCase() === "video") {
    return {
      attrs: {
        src: href,
        title: null,
      },
      type: "videoBlock",
    }
  }

  const fileMatch = /^File:\s*(.+)$/i.exec(label)

  if (fileMatch) {
    return {
      attrs: {
        href,
        title: fileMatch[1].trim(),
      },
      type: "fileBlock",
    }
  }

  return null
}

function structuralBlockToHtml(block: {
  attrs?: Record<string, unknown>
  type: string
}) {
  switch (block.type) {
    case "databaseBlock": {
      const databaseId = block.attrs?.databaseId
      return typeof databaseId === "string" && databaseId
        ? `<div data-type="databaseBlock" data-database-id="${escapeHtmlAttr(databaseId)}"></div>`
        : `<div data-type="databaseBlock"></div>`
    }
    case "pageBlock": {
      const pageId = block.attrs?.pageId
      return typeof pageId === "string" && pageId
        ? `<div data-type="pageBlock" data-page-id="${escapeHtmlAttr(pageId)}"></div>`
        : `<div data-type="pageBlock"></div>`
    }
    case "videoBlock": {
      const src = block.attrs?.src
      return typeof src === "string" && src
        ? `<div data-type="videoBlock" data-src="${escapeHtmlAttr(src)}"></div>`
        : `<div data-type="videoBlock"></div>`
    }
    case "fileBlock": {
      const href = block.attrs?.href
      const title = block.attrs?.title
      const hrefAttr =
        typeof href === "string" && href
          ? ` data-href="${escapeHtmlAttr(href)}"`
          : ""
      const titleAttr =
        typeof title === "string" && title
          ? ` data-title="${escapeHtmlAttr(title)}"`
          : ""

      return `<div data-type="fileBlock"${hrefAttr}${titleAttr}></div>`
    }
    case "imageBlock": {
      const src = block.attrs?.src
      const alt = block.attrs?.alt
      const srcAttr =
        typeof src === "string" && src
          ? ` data-src="${escapeHtmlAttr(src)}"`
          : ""
      const altAttr =
        typeof alt === "string" && alt
          ? ` data-alt="${escapeHtmlAttr(alt)}"`
          : ""

      return `<div data-type="imageBlock"${srcAttr}${altAttr}></div>`
    }
    default:
      return ""
  }
}

function escapeHtmlAttr(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
}

function readPlainParagraphText(node: MarkdownContentNode) {
  if (!node.content?.length) {
    return ""
  }

  if (!node.content.every((entry) => entry.type === "text" && !entry.marks?.length)) {
    return ""
  }

  return node.content.map((entry) => entry.text ?? "").join("")
}