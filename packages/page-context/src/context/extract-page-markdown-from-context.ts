export function extractPageMarkdownFromContext(
  contextMarkdown: string,
  pageId: string,
) {
  if (!contextMarkdown.trim() || !pageId.trim()) {
    return null
  }

  const sectionPattern = /^## \[(?:Primary|Attached)\][^\n]*\(page\)\s*$/gm
  const matches = [...contextMarkdown.matchAll(sectionPattern)]

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]
    const start = match.index ?? 0
    const end = matches[index + 1]?.index ?? contextMarkdown.length
    const section = contextMarkdown.slice(start, end).trim()

    if (!section.includes(`Page ID: ${pageId}`)) {
      continue
    }

    const lines = section.split("\n")
    const pathLineIndex = lines.findIndex((line) => line.startsWith("Path:"))

    if (pathLineIndex === -1) {
      continue
    }

    const databaseHeaderIndex = lines.findIndex((line) =>
      line.startsWith("### Databases on this page"),
    )
    const bodyEnd =
      databaseHeaderIndex === -1 ? lines.length : databaseHeaderIndex
    const body = lines.slice(pathLineIndex + 1, bodyEnd).join("\n").trim()

    return body || null
  }

  return null
}