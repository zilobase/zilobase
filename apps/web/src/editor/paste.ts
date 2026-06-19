import type { EditorView } from "@tiptap/pm/view"
import {
  normalizeEmbedUrl,
  type EmbedProvider,
} from "@/packages/editor/extensions/embed-block"
import { pastedBlockElementSelector } from "./constants"
import type { EditorTableType, PasteChoiceState } from "./types"

const getEmbedProvider = (embedAttrs: Record<string, unknown>): EmbedProvider | null =>
  "provider" in embedAttrs ? (embedAttrs.provider as EmbedProvider) : null

export const looksLikeUrl = (value: string) =>
  /^(https?:\/\/|www\.|[^\s]+\.[^\s]{2,})/i.test(value.trim())

export const normalizePastedUrl = (value: string) => {
  const trimmed = value.trim()
  try {
    return new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    ).toString()
  } catch {
    return null
  }
}

const getEmojiFromImageSource = (image: HTMLImageElement) => {
  const source = image.getAttribute("src")
  if (!source) return null

  const match = source.match(/\/([0-9a-f-]+)\.(?:png|svg|webp)(?:[?#].*)?$/i)
  if (!match) return null

  try {
    return String.fromCodePoint(
      ...match[1].split("-").map((codepoint) => Number.parseInt(codepoint, 16))
    )
  } catch {
    return null
  }
}

const restoreEmojiTextFromPastedDocument = (document: Document) => {
  let replaced = false
  for (const emojiElement of Array.from(
    document.querySelectorAll('[data-type="emoji"]')
  )) {
    const emoji = getEmojiFromImageSource(
      emojiElement.querySelector("img") as HTMLImageElement
    )
    if (!emoji) continue
    emojiElement.replaceWith(document.createTextNode(emoji))
    replaced = true
  }
  return replaced
}

const detectEditorTableType = (table: HTMLTableElement): EditorTableType => {
  const rows = table.querySelectorAll("tbody > tr")
  const firstRowCells = table.querySelectorAll("tbody > tr:first-child > td")
  const isDataTable =
    table.querySelectorAll("th").length > 0 ||
    rows.length > 1 ||
    table.querySelectorAll("[colwidth]").length > 0

  if (isDataTable) return "table"
  if (rows.length === 1 && firstRowCells.length > 1) return "columns"
  return "unknown"
}

const appendTableCellContentToColumn = (
  document: Document,
  cell: HTMLTableCellElement,
  column: HTMLDivElement
) => {
  if (!cell.textContent?.trim() && cell.children.length === 0) {
    column.appendChild(document.createElement("p"))
    return
  }
  const target = cell.querySelector(pastedBlockElementSelector) ? column : document.createElement("p")
  while (cell.firstChild) target.appendChild(cell.firstChild)
  if (target !== column) column.appendChild(target)
}

const createColumnBlockFromTable = (
  document: Document,
  table: HTMLTableElement
) => {
  const cells = Array.from(
    table.querySelectorAll<HTMLTableCellElement>("tbody > tr:first-child > td")
  )
  const columnBlock = document.createElement("div")
  columnBlock.setAttribute("data-type", "columnBlock")
  columnBlock.setAttribute("data-column-count", String(cells.length))
  columnBlock.setAttribute(
    "data-widths",
    JSON.stringify(Array.from({ length: cells.length }, () => 100 / cells.length))
  )
  for (const cell of cells) {
    const column = document.createElement("div")
    column.setAttribute("data-type", "column")
    appendTableCellContentToColumn(document, cell, column)
    columnBlock.appendChild(column)
  }
  return columnBlock
}

const transformPastedEditorTables = (document: Document) => {
  let transformed = false
  for (const table of Array.from(document.querySelectorAll("table"))) {
    if (!table.isConnected || table.parentElement?.closest("table")) continue
    if (detectEditorTableType(table) !== "columns") continue
    table.replaceWith(createColumnBlockFromTable(document, table))
    transformed = true
  }
  return transformed
}

export const normalizePastedEditorHTML = (html: string) => {
  const document = new DOMParser().parseFromString(html, "text/html")
  const changed =
    restoreEmojiTextFromPastedDocument(document) ||
    transformPastedEditorTables(document)
  return changed ? document.body.innerHTML : html
}

export const createProviderLinkPasteChoice = (
  view: EditorView,
  pastedText: string,
  embedAttrs: Record<string, unknown>
): PasteChoiceState => {
  const { from } = view.state.selection
  const insertedTo = from + pastedText.length
  const coords = view.coordsAtPos(insertedTo)
  return {
    anchor: {
      getBoundingClientRect: () =>
        new DOMRect(coords.left, coords.bottom, 0, 0),
    },
    embedAttrs,
    from,
    provider: getEmbedProvider(embedAttrs),
    to: insertedTo,
    url: normalizePastedUrl(pastedText) ?? pastedText,
  }
}

export const handleProviderLinkPaste = (
  view: EditorView,
  event: ClipboardEvent,
  editable: boolean,
  onPasteChoice: (choice: PasteChoiceState) => void
) => {
  if (!editable) return false

  const pastedText = event.clipboardData?.getData("text/plain").trim()
  if (!pastedText || /\s/.test(pastedText) || !looksLikeUrl(pastedText)) {
    return false
  }

  const embedAttrs = normalizeEmbedUrl(pastedText)
  if (!embedAttrs) return false

  event.preventDefault()
  const { from, to } = view.state.selection
  view.dispatch(view.state.tr.insertText(pastedText, from, to))
  onPasteChoice(createProviderLinkPasteChoice(view, pastedText, embedAttrs))
  return true
}