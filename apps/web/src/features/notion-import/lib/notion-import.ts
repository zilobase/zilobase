import { strFromU8, unzipSync } from "fflate"

import { normalizeNotionHtmlBlocks } from "@/features/notion-import/lib/notion-html-blocks"

type CreatePageInput = {
  emoji?: string
  name: string
  parentItemId?: string
  workspaceId: string
}

type UpdatePageInput = {
  content: unknown
  id: string
}

export type ImportNotionZipInput = {
  createPage: (input: CreatePageInput) => Promise<{ id: string }>
  file: File
  updatePage: (input: UpdatePageInput) => Promise<unknown>
  workspaceId: string
}

export type ImportNotionZipResult = {
  createdPageIds: string[]
  entryPageId: string | null
  skippedAssets: number
  warnings: string[]
}

export class NotionImportError extends Error {}

export async function importNotionZipFile({
  createPage,
  file,
  updatePage,
  workspaceId,
}: ImportNotionZipInput): Promise<ImportNotionZipResult> {
  const entries = readZipEntries(new Uint8Array(await file.arrayBuffer()))
  const markdownFiles = entries.filter((entry) => entry.path.endsWith(".md"))

  if (markdownFiles.length > 0) {
    throw new NotionImportError("Export your Notion pages as HTML, not Markdown.")
  }

  const htmlEntries = entries
    .filter((entry) => entry.path.endsWith(".html") && getFilename(entry.path) !== "index.html")
    .map((entry) => ({
      html: strFromU8(entry.content),
      parentPath: getParentPagePath(entry.path),
      path: entry.path,
    }))
    .filter((entry) => hasImportableBody(entry.html))
    .sort((first, second) => getDepth(first.path) - getDepth(second.path))

  if (htmlEntries.length === 0) {
    throw new NotionImportError("No Notion HTML pages were found in this zip.")
  }

  const pageIdsByPath = new Map<string, string>()
  const createdPageIds: string[] = []
  let skippedAssets = 0
  const warnings: string[] = []

  for (const entry of htmlEntries) {
    const parsed = normalizeNotionHtmlBlocks(entry.html)

    const parentItemId = entry.parentPath
      ? pageIdsByPath.get(entry.parentPath)
      : undefined
    const page = await createPage({
      emoji: parsed.emoji ?? undefined,
      name: parsed.title,
      parentItemId,
      workspaceId,
    })

    pageIdsByPath.set(entry.path, page.id)
    pageIdsByPath.set(stripHtmlExtension(entry.path), page.id)
    createdPageIds.push(page.id)
  }

  const pagePathMap = buildPagePathMap(pageIdsByPath)

  for (const entry of htmlEntries) {
    const pageId = pageIdsByPath.get(entry.path)
    if (!pageId) {
      continue
    }

    const parsed = normalizeNotionHtmlBlocks(entry.html, { pagePathMap })
    skippedAssets += parsed.skippedAssets
    warnings.push(...parsed.warnings)
    await updatePage({ id: pageId, content: parsed.content })
  }

  return {
    createdPageIds,
    entryPageId: createdPageIds[0] ?? null,
    skippedAssets,
    warnings: [...new Set(warnings)],
  }
}

function readZipEntries(
  content: Uint8Array,
  prefix = "",
): Array<{ content: Uint8Array; path: string }> {
  const zip = unzipSync(content)
  const entries: Array<{ content: Uint8Array; path: string }> = []

  for (const [rawPath, entryContent] of Object.entries(zip)) {
    const path = `${prefix}${rawPath}`.replace(/^\/+/, "")

    if (path.startsWith("__MACOSX/") || path.endsWith("/")) {
      continue
    }

    if (path.endsWith(".zip")) {
      entries.push(...readZipEntries(entryContent, `${stripZipExtension(path)}/`))
      continue
    }

    entries.push({ content: entryContent, path })
  }

  return entries
}

function hasImportableBody(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html")
  const body = doc.querySelector(".page-body") ?? doc.body

  return Boolean(body.textContent?.trim() || body.querySelector("img, video, iframe, table"))
}

function getParentPagePath(path: string) {
  const parentFolder = path.split("/").slice(0, -1).join("/")

  return parentFolder ? `${parentFolder}.html` : null
}

function getDepth(path: string) {
  return path.split("/").length
}

function getFilename(path: string) {
  return path.split("/").at(-1) ?? path
}

function buildPagePathMap(pageIdsByPath: Map<string, string>) {
  const map = new Map<string, string>()

  for (const [path, pageId] of pageIdsByPath.entries()) {
    const normalized = normalizePath(path)
    map.set(normalized, pageId)
    map.set(`./${normalized}`, pageId)
    map.set(normalized.split("/").at(-1) ?? normalized, pageId)
  }

  return map
}

function stripHtmlExtension(path: string) {
  return path.replace(/\.html$/i, "")
}

function stripZipExtension(path: string) {
  return path.replace(/\.zip$/i, "")
}

function normalizePath(value: string) {
  try {
    return decodeURIComponent(value).replace(/^\.\//, "").replace(/^\/+/, "")
  } catch {
    return value.replace(/^\.\//, "").replace(/^\/+/, "")
  }
}
