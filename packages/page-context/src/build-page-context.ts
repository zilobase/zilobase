import { buildDatabaseMarkdown } from "./build-database-markdown"
import { prosemirrorToMarkdown } from "./prosemirror-to-markdown"
import type {
  BuildContextInput,
  BuildContextResult,
  ContextSection,
  DatabaseContextSection,
  PageContextSection,
} from "./types"

const DEFAULT_MAX_CHARS = 16_000

export function buildContextMarkdown(input: BuildContextInput): BuildContextResult {
  const maxChars = input.maxChars ?? DEFAULT_MAX_CHARS
  const trimmedAttachmentIds: string[] = []
  const sectionMarkdown = input.sections.map((section) => buildSection(section))
  let markdown = ["# Notelab page context", "", ...sectionMarkdown]
    .filter(Boolean)
    .join("\n\n")
    .trim()

  if (markdown.length <= maxChars) {
    return {
      markdown,
      charCount: markdown.length,
      trimmedAttachmentIds,
    }
  }

  const primarySection = input.sections.find((section) => section.role === "primary")
  const attachedSections = input.sections.filter(
    (section) => section.role === "attached",
  )
  const keptAttached: ContextSection[] = []

  for (let index = attachedSections.length - 1; index >= 0; index -= 1) {
    const candidate = [
      primarySection,
      ...attachedSections.slice(0, index + 1),
    ].filter((section): section is ContextSection => Boolean(section))
    const candidateMarkdown = [
      "# Notelab page context",
      "",
      ...candidate.map((section) => buildSection(section)),
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim()

    if (candidateMarkdown.length <= maxChars) {
      keptAttached.push(...attachedSections.slice(0, index + 1))
      markdown = candidateMarkdown
      break
    }
  }

  if (keptAttached.length < attachedSections.length) {
    for (
      let index = keptAttached.length;
      index < attachedSections.length;
      index += 1
    ) {
      trimmedAttachmentIds.push(getSectionId(attachedSections[index]!))
    }
  }

  if (!primarySection) {
    markdown = markdown.slice(0, maxChars)
  }

  return {
    markdown,
    charCount: markdown.length,
    trimmedAttachmentIds,
  }
}

function buildSection(section: ContextSection) {
  if (section.kind === "page") {
    return buildPageSection(section)
  }

  return buildDatabaseSection(section)
}

function buildPageSection(section: PageContextSection) {
  const roleLabel = section.role === "primary" ? "Primary" : "Attached"
  const pageMarkdown = prosemirrorToMarkdown(section.content)
  const databaseSections = section.databases.map((database) =>
    buildDatabaseMarkdown(database.schema, database.linkedSourceSchemas),
  )

  return [
    `## [${roleLabel}] ${section.title} (page)`,
    `Page ID: ${section.id}`,
    `Path: ${section.path}`,
    pageMarkdown || "_Empty page_",
    databaseSections.length > 0 ? "### Databases on this page" : "",
    ...databaseSections,
  ]
    .filter(Boolean)
    .join("\n\n")
}

function buildDatabaseSection(section: DatabaseContextSection) {
  const roleLabel = section.role === "primary" ? "Primary" : "Attached"

  return [
    `## [${roleLabel}] ${section.schema.database.name} (database)`,
    buildDatabaseMarkdown(section.schema, section.linkedSourceSchemas),
  ].join("\n\n")
}

function getSectionId(section: ContextSection) {
  return section.kind === "page" ? section.id : section.schema.database.id
}