import { generateJSON, type JSONContent } from "@tiptap/core"
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details"
import Link from "@tiptap/extension-link"
import { Table } from "@tiptap/extension-table"
import { TableCell } from "@tiptap/extension-table-cell"
import { TableHeader } from "@tiptap/extension-table-header"
import { TableRow } from "@tiptap/extension-table-row"
import TaskItem from "@tiptap/extension-task-item"
import TaskList from "@tiptap/extension-task-list"
import StarterKit from "@tiptap/starter-kit"

export type NotionHtmlBlockResult = {
  title: string
  emoji: string | null
  html: string
  content: JSONContent
  warnings: string[]
  skippedAssets: number
}

export type NotionHtmlBlockOptions = {
  pagePathMap?: Map<string, string>
}

const notionImportExtensions = [
  StarterKit.configure({ link: false }),
  Link.configure({ openOnClick: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Details,
  DetailsSummary,
  DetailsContent,
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
]

export function normalizeNotionHtmlBlocks(
  sourceHtml: string,
  options: NotionHtmlBlockOptions = {},
): NotionHtmlBlockResult {
  const doc = new DOMParser().parseFromString(sourceHtml, "text/html")
  const pageBody = doc.querySelector(".page-body") ?? doc.body
  const warnings: string[] = []

  if (!doc.querySelector(".page-body")) {
    warnings.push("Notion page body was not found; imported the document body.")
  }

  const body = doc.createElement("div")
  body.innerHTML = pageBody.innerHTML
  const skippedAssets = normalizeBody(body, doc, warnings, options.pagePathMap)
  const html = body.innerHTML.trim()
  const content = htmlToContent(html)

  return {
    title: extractTitle(doc),
    emoji: extractEmoji(doc),
    html,
    content,
    warnings,
    skippedAssets,
  }
}

function htmlToContent(html: string): JSONContent {
  const source = html || "<p></p>"

  try {
    const parsed = generateJSON(source, notionImportExtensions)
    const compacted = removeEmptyTopLevelParagraphs(parsed)
    if (!isEmptyDocument(compacted)) {
      return compacted
    }
  } catch {
    // Fall back to the small importer schema below.
  }

  return removeEmptyTopLevelParagraphs(fallbackHtmlToContent(source))
}

function isEmptyDocument(content: JSONContent) {
  return (
    content.type === "doc" &&
    content.content?.length === 1 &&
    content.content[0]?.type === "paragraph" &&
    !content.content[0].content
  )
}

function removeEmptyTopLevelParagraphs(content: JSONContent): JSONContent {
  if (content.type !== "doc") {
    return content
  }

  const blocks = content.content?.filter((block) => !isEmptyParagraph(block)) ?? []

  return {
    ...content,
    content: blocks.length > 0 ? blocks : [{ type: "paragraph" }],
  }
}

function isEmptyParagraph(content: JSONContent) {
  return content.type === "paragraph" && !content.content
}

function fallbackHtmlToContent(html: string): JSONContent {
  const doc = new DOMParser().parseFromString(`<main>${html}</main>`, "text/html")
  const root = doc.querySelector("main") ?? doc.body
  const content = Array.from(root.childNodes).flatMap((node) => blockNodeToJson(node))

  return {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  }
}

function blockNodeToJson(node: Node): JSONContent[] {
  if (node.nodeType === 3) {
    const text = node.textContent?.trim()
    return text ? [{ type: "paragraph", content: [{ type: "text", text }] }] : []
  }

  if (node.nodeType !== 1) {
    return []
  }

  const element = node as Element
  const tagName = element.tagName.toLowerCase()

  if (/^h[1-6]$/.test(tagName)) {
    return [
      {
        type: "heading",
        attrs: { level: Math.min(Number(tagName.slice(1)), 3) },
        ...withInlineContent(element),
      },
    ]
  }

  if (tagName === "p") {
    return [{ type: "paragraph", ...withInlineContent(element) }]
  }

  if (tagName === "blockquote") {
    return [
      {
        type: "blockquote",
        content: childBlocks(element, [{ type: "paragraph", ...withInlineContent(element) }]),
      },
    ]
  }

  if (tagName === "pre") {
    return [
      {
        type: "codeBlock",
        attrs: { language: null },
        content: [{ type: "text", text: element.textContent ?? "" }],
      },
    ]
  }

  if (tagName === "hr") {
    return [{ type: "horizontalRule" }]
  }

  if (tagName === "ul" && element.getAttribute("data-type") === "taskList") {
    return [
      {
        type: "taskList",
        content: Array.from(element.children).map((item) => ({
          type: "taskItem",
          attrs: { checked: item.getAttribute("data-checked") === "true" },
          content: childBlocks(item, [{ type: "paragraph", ...withInlineContent(item) }]),
        })),
      },
    ]
  }

  if (tagName === "ul" || tagName === "ol") {
    return [
      {
        type: tagName === "ol" ? "orderedList" : "bulletList",
        content: Array.from(element.children).map((item) => ({
          type: "listItem",
          content: childBlocks(item, [{ type: "paragraph", ...withInlineContent(item) }]),
        })),
      },
    ]
  }

  if (tagName === "table") {
    return [
      {
        type: "table",
        content: Array.from(element.querySelectorAll("tr")).map((row) => ({
          type: "tableRow",
          content: Array.from(row.children).map((cell) => ({
            type: cell.tagName.toLowerCase() === "th" ? "tableHeader" : "tableCell",
            content: [{ type: "paragraph", ...withInlineContent(cell) }],
          })),
        })),
      },
    ]
  }

  if (tagName === "details") {
    const summary = element.querySelector("summary")
    const rest = Array.from(element.childNodes).filter((child) => child !== summary)

    return [
      {
        type: "details",
        attrs: { open: element.hasAttribute("open") },
        content: [
          {
            type: "detailsSummary",
            content: [{ type: "paragraph", ...withInlineContent(summary ?? element) }],
          },
          {
            type: "detailsContent",
            content: rest.flatMap((child) => blockNodeToJson(child)),
          },
        ],
      },
    ]
  }

  return childBlocks(element)
}

function childBlocks(element: Element, fallback: JSONContent[] = []) {
  const blocks = Array.from(element.childNodes).flatMap((child) => blockNodeToJson(child))
  return blocks.length > 0 ? blocks : fallback
}

function withInlineContent(element: Element): Pick<JSONContent, "content"> {
  const content = Array.from(element.childNodes).flatMap((child) => inlineNodeToJson(child))
  return content.length > 0 ? { content } : {}
}

function inlineNodeToJson(node: Node, marks: JSONContent["marks"] = []): JSONContent[] {
  if (node.nodeType === 3) {
    const text = node.textContent ?? ""
    return text ? [{ type: "text", text, ...(marks?.length ? { marks } : {}) }] : []
  }

  if (node.nodeType !== 1) {
    return []
  }

  const element = node as Element
  const tagName = element.tagName.toLowerCase()
  const nextMarks = [...(marks ?? [])]

  if (tagName === "strong" || tagName === "b") {
    nextMarks.push({ type: "bold" })
  } else if (tagName === "em" || tagName === "i") {
    nextMarks.push({ type: "italic" })
  } else if (tagName === "code") {
    nextMarks.push({ type: "code" })
  } else if (tagName === "a") {
    nextMarks.push({ type: "link", attrs: { href: element.getAttribute("href"), target: null, rel: null, class: null } })
  } else if (tagName === "br") {
    return [{ type: "hardBreak" }]
  }

  return Array.from(element.childNodes).flatMap((child) => inlineNodeToJson(child, nextMarks))
}

function normalizeBody(
  body: HTMLElement,
  doc: Document,
  warnings: string[],
  pagePathMap: Map<string, string> | undefined,
) {
  let skippedAssets = 0

  for (const element of Array.from(body.querySelectorAll("style, script"))) {
    element.remove()
  }

  for (const database of Array.from(body.querySelectorAll(".collection-content"))) {
    database.replaceWith(createParagraph(doc, "[Database skipped]"))
    warnings.push("Skipped a Notion database.")
  }

  for (const toc of Array.from(body.querySelectorAll("nav"))) {
    toc.replaceWith(createTableOfContentsBlock(toc, doc))
  }

  for (const callout of Array.from(body.querySelectorAll("figure.callout"))) {
    callout.replaceWith(createCalloutBlock(callout, doc))
  }

  for (const list of Array.from(body.querySelectorAll("ul.to-do-list"))) {
    normalizeTaskList(list, doc)
  }

  for (const list of Array.from(body.querySelectorAll("ul.toggle"))) {
    list.replaceWith(...Array.from(list.children).map((child) => createToggleBlock(child, doc)))
  }

  for (const checkbox of Array.from(body.querySelectorAll(".checkbox"))) {
    checkbox.remove()
  }

  for (const equation of Array.from(body.querySelectorAll(".equation, .katex, .math"))) {
    const text = equation.textContent?.trim()
    if (text) {
      const code = doc.createElement("code")
      code.textContent = text
      equation.replaceWith(code)
    }
  }

  for (const asset of Array.from(body.querySelectorAll("img, video, iframe"))) {
    const name = asset.getAttribute("alt") || asset.getAttribute("title") || asset.getAttribute("src") || "asset"
    asset.replaceWith(createParagraph(doc, `[Asset skipped: ${basename(name)}]`))
    skippedAssets += 1
  }

  for (const source of Array.from(body.querySelectorAll("figure .source"))) {
    const link = source.querySelector("a")
    const name = link?.textContent?.trim() || link?.getAttribute("href") || "file"
    source.closest("figure")?.replaceWith(createParagraph(doc, `[File skipped: ${basename(name)}]`))
    skippedAssets += 1
  }

  rewriteLinks(body, pagePathMap)
  stripNotionClasses(body)

  return skippedAssets
}

function extractTitle(doc: Document) {
  const title =
    doc.querySelector("header h1")?.textContent ??
    doc.querySelector("title")?.textContent ??
    doc.querySelector("h1")?.textContent ??
    "Untitled"

  return title.trim() || "Untitled"
}

function extractEmoji(doc: Document) {
  const explicit =
    doc.querySelector(".page-header-icon .icon")?.textContent ??
    doc.querySelector(".page-header-icon [role='img']")?.textContent
  const value = explicit?.trim()

  if (value && /\p{Emoji}/u.test(value)) {
    return value
  }

  const title = extractTitle(doc)
  const match = /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/u.exec(title)

  return match?.[0] ?? null
}

function createParagraph(doc: Document, text: string) {
  const paragraph = doc.createElement("p")
  paragraph.textContent = text
  return paragraph
}

function createTableOfContentsBlock(toc: Element, doc: Document) {
  const wrapper = doc.createElement("div")
  const heading = doc.createElement("h2")
  const list = doc.createElement("ul")

  heading.textContent = "Table of contents"
  wrapper.append(heading, list)

  for (const link of Array.from(toc.querySelectorAll("a"))) {
    const item = doc.createElement("li")
    const nextLink = doc.createElement("a")
    nextLink.href = link.getAttribute("href") ?? "#"
    nextLink.textContent = link.textContent?.trim() || "Untitled"
    item.append(nextLink)
    list.append(item)
  }

  return wrapper
}

function createCalloutBlock(callout: Element, doc: Document) {
  const quote = doc.createElement("blockquote")
  const icon = callout.querySelector(".icon")?.textContent?.trim()
  const content = Array.from(callout.children).filter(
    (child) => !child.classList.contains("icon") && !child.querySelector(":scope > .icon"),
  )

  if (icon) {
    quote.append(createParagraph(doc, icon))
  }

  if (content.length === 0) {
    const text = callout.textContent?.replace(icon ?? "", "").trim()
    if (text) {
      quote.append(createParagraph(doc, text))
    }
    return quote
  }

  for (const child of content) {
    quote.append(child.cloneNode(true))
  }

  return quote
}

function normalizeTaskList(list: Element, doc: Document) {
  list.setAttribute("data-type", "taskList")

  for (const item of Array.from(list.children)) {
    if (item.nodeType !== 1) {
      continue
    }

    const checked = Boolean(item.querySelector(".checkbox-on"))
    const content = item.cloneNode(true) as Element
    for (const checkbox of Array.from(content.querySelectorAll(".checkbox"))) {
      checkbox.remove()
    }

    item.replaceChildren()
    item.setAttribute("data-type", "taskItem")
    item.setAttribute("data-checked", checked ? "true" : "false")

    const paragraph = doc.createElement("p")
    paragraph.innerHTML = content.innerHTML.trim() || content.textContent?.trim() || ""
    item.append(paragraph)
  }
}

function createToggleBlock(child: Element, doc: Document) {
  const existingDetails = child.querySelector("details")
  if (existingDetails) {
    return existingDetails.cloneNode(true)
  }

  const details = doc.createElement("details")
  const summary = doc.createElement("summary")
  summary.textContent = child.textContent?.trim() || "Toggle"
  details.append(summary)
  return details
}

function rewriteLinks(body: HTMLElement, pagePathMap: Map<string, string> | undefined) {
  for (const link of Array.from(body.querySelectorAll("a[href]"))) {
    const href = link.getAttribute("href")
    if (!href) {
      continue
    }

    const pageId = findLinkedPageId(href, pagePathMap)
    if (pageId) {
      link.setAttribute("href", `/p/${pageId}`)
    }
  }
}

function findLinkedPageId(href: string, pagePathMap: Map<string, string> | undefined) {
  if (!pagePathMap) {
    return null
  }

  const normalizedHref = normalizePath(href)
  const withoutHash = normalizedHref.split("#")[0]

  return (
    pagePathMap.get(normalizedHref) ??
    pagePathMap.get(withoutHash) ??
    Array.from(pagePathMap.entries()).find(([path]) => withoutHash.endsWith(path))?.[1] ??
    null
  )
}

function stripNotionClasses(body: HTMLElement) {
  for (const element of Array.from(body.querySelectorAll("[class]"))) {
    element.removeAttribute("class")
  }
}

function normalizePath(value: string) {
  try {
    return decodeURIComponent(value).replace(/^\.\//, "").replace(/^\/+/, "")
  } catch {
    return value.replace(/^\.\//, "").replace(/^\/+/, "")
  }
}

function basename(value: string) {
  return normalizePath(value).split("/").filter(Boolean).at(-1) ?? value
}
