export type PageEditMode = "patch" | "full"

export const STALE_PAGE_PATCH_RESOLVE_ERROR =
  "Could not find the requested section in the page. Copy searchText verbatim from the page content."

export function isStalePageEditResolveError(errorMessage: string) {
  return errorMessage === STALE_PAGE_PATCH_RESOLVE_ERROR
}

export type ResolvePageEditInput = {
  afterMarkdown?: string
  beforeMarkdown: string
  contextPageMarkdown?: string | null
  editMode: PageEditMode
  replaceText?: string
  searchText?: string
}

const MIN_FULL_PAGE_RETENTION_RATIO = 0.55

const STRUCTURAL_MARKERS = [
  /\[Database\b/gi,
  /\[YouTube\b/gi,
  /\[Embedded\b/gi,
  /!\[[^\]]*\]\([^)]+\)/g,
  /https?:\/\/[^\s)]+/g,
] as const

export function resolvePageEditMarkdown(input: ResolvePageEditInput) {
  if (input.editMode === "patch") {
    return resolvePatchEdit(input)
  }

  return resolveFullPageEdit(input)
}

function resolvePatchEdit(input: ResolvePageEditInput) {
  const searchText = input.searchText?.trim()
  const replaceText = input.replaceText ?? ""

  if (!searchText) {
    return {
      errorMessage:
        "Patch edits require searchText copied from the current page content.",
      success: false as const,
    }
  }

  const editorPatch = applyMarkdownPatch(
    input.beforeMarkdown,
    searchText,
    replaceText,
  )

  if (
    editorPatch &&
    editorPatch !== input.beforeMarkdown
  ) {
    return {
      afterMarkdown: editorPatch,
      patchSource: "editor",
      success: true as const,
    }
  }

  const contextMarkdown = input.contextPageMarkdown?.trim()

  if (contextMarkdown) {
    const contextPatch = applyMarkdownPatch(
      contextMarkdown,
      searchText,
      replaceText,
    )

    if (contextPatch && contextPatch !== contextMarkdown) {
      const matchedSearchText =
        findMatchedSearchSpan(contextMarkdown, searchText) ?? searchText
      const transferredPatch =
        applyMarkdownPatch(
          input.beforeMarkdown,
          matchedSearchText,
          replaceText,
        ) ??
        transferPatchToEditor(
          input.beforeMarkdown,
          matchedSearchText,
          replaceText,
        )

      if (
        transferredPatch &&
        transferredPatch !== input.beforeMarkdown
      ) {
        return {
          afterMarkdown: transferredPatch,
          patchSource: "editor-transferred",
          success: true as const,
        }
      }
    }
  }

  return {
    errorMessage: STALE_PAGE_PATCH_RESOLVE_ERROR,
    success: false as const,
  }
}

function resolveFullPageEdit(input: ResolvePageEditInput) {
  const afterMarkdown = input.afterMarkdown?.trim()

  if (!afterMarkdown) {
    return {
      errorMessage: "Full-page edits require afterMarkdown.",
      success: false as const,
    }
  }

  const validationError = validateFullPageReplacement(
    input.beforeMarkdown,
    afterMarkdown,
  )

  if (validationError) {
    return {
      errorMessage: validationError,
      success: false as const,
    }
  }

  return {
    afterMarkdown,
    success: true as const,
  }
}

function transferPatchToEditor(
  editorMarkdown: string,
  searchText: string,
  replaceText: string,
) {
  const strategies = [
    () => replaceParagraphBlocks(editorMarkdown, searchText, replaceText),
    () => replaceAnchorWindow(editorMarkdown, searchText, replaceText),
    () => replaceFlexibleWhitespace(editorMarkdown, searchText, replaceText),
    () => replaceLineAligned(editorMarkdown, searchText, replaceText),
    () => replaceNormalized(editorMarkdown, searchText, replaceText),
  ]

  for (const strategy of strategies) {
    const result = strategy()

    if (result) {
      return result
    }
  }

  return null
}

export function applyMarkdownPatch(
  beforeMarkdown: string,
  searchText: string,
  replaceText: string,
) {
  const strategies = [
    () => replaceExact(beforeMarkdown, searchText, replaceText),
    () => replaceFlexibleWhitespace(beforeMarkdown, searchText, replaceText),
    () => replaceLineAligned(beforeMarkdown, searchText, replaceText),
    () => replaceParagraphBlocks(beforeMarkdown, searchText, replaceText),
    () => replaceNormalized(beforeMarkdown, searchText, replaceText),
  ]

  for (const strategy of strategies) {
    const result = strategy()

    if (result) {
      return result
    }
  }

  return null
}

function replaceExact(
  beforeMarkdown: string,
  searchText: string,
  replaceText: string,
) {
  if (!beforeMarkdown.includes(searchText)) {
    return null
  }

  return beforeMarkdown.replace(searchText, replaceText)
}

function replaceFlexibleWhitespace(
  beforeMarkdown: string,
  searchText: string,
  replaceText: string,
) {
  const flexiblePattern = buildFlexibleWhitespacePattern(searchText)
  const match = flexiblePattern.exec(beforeMarkdown)

  if (!match) {
    return null
  }

  return (
    beforeMarkdown.slice(0, match.index) +
    replaceText +
    beforeMarkdown.slice(match.index + match[0].length)
  )
}

function replaceParagraphBlocks(
  beforeMarkdown: string,
  searchText: string,
  replaceText: string,
) {
  const beforeBlocks = splitParagraphBlocks(beforeMarkdown)
  const searchBlocks = splitParagraphBlocks(searchText)
    .map((block) => block.trim())
    .filter(Boolean)

  if (searchBlocks.length === 0) {
    return null
  }

  for (
    let start = 0;
    start <= beforeBlocks.length - searchBlocks.length;
    start += 1
  ) {
    let matched = true

    for (let offset = 0; offset < searchBlocks.length; offset += 1) {
      if (
        normalizePatchText(beforeBlocks[start + offset] ?? "") !==
        normalizePatchText(searchBlocks[offset] ?? "")
      ) {
        matched = false
        break
      }
    }

    if (!matched) {
      continue
    }

    const prefix = beforeBlocks.slice(0, start)
    const suffix = beforeBlocks.slice(start + searchBlocks.length)
    const replacementBlocks = splitParagraphBlocks(replaceText)

    return [...prefix, ...replacementBlocks, ...suffix].join("\n\n")
  }

  return null
}

function replaceAnchorWindow(
  beforeMarkdown: string,
  searchText: string,
  replaceText: string,
) {
  const normalizedSearch = normalizePatchText(searchText)

  if (normalizedSearch.length < 24) {
    return null
  }

  const anchorLength = Math.min(72, normalizedSearch.length)
  const anchor = normalizedSearch.slice(0, anchorLength)
  const normalizedBefore = normalizePatchText(beforeMarkdown)
  const anchorIndex = normalizedBefore.indexOf(anchor)

  if (anchorIndex === -1) {
    return null
  }

  const span = findOriginalSpanForNormalizedSearch(beforeMarkdown, searchText)

  if (!span) {
    return null
  }

  return (
    beforeMarkdown.slice(0, span.start) +
    replaceText +
    beforeMarkdown.slice(span.end)
  )
}

function splitParagraphBlocks(markdown: string) {
  return markdown.split(/\n{2,}/)
}

function replaceLineAligned(
  beforeMarkdown: string,
  searchText: string,
  replaceText: string,
) {
  const beforeLines = beforeMarkdown.split("\n")
  const searchLines = searchText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  if (searchLines.length === 0) {
    return null
  }

  for (let start = 0; start <= beforeLines.length - searchLines.length; start += 1) {
    let matched = true

    for (let offset = 0; offset < searchLines.length; offset += 1) {
      if (
        normalizePatchLine(beforeLines[start + offset] ?? "") !==
        normalizePatchLine(searchLines[offset] ?? "")
      ) {
        matched = false
        break
      }
    }

    if (!matched) {
      continue
    }

    const prefix = beforeLines.slice(0, start)
    const suffix = beforeLines.slice(start + searchLines.length)
    const replacementLines = replaceText.split("\n")

    return [...prefix, ...replacementLines, ...suffix].join("\n")
  }

  return null
}

function replaceNormalized(
  beforeMarkdown: string,
  searchText: string,
  replaceText: string,
) {
  const normalizedBefore = normalizePatchText(beforeMarkdown)
  const normalizedSearch = normalizePatchText(searchText)

  if (!normalizedSearch || !normalizedBefore.includes(normalizedSearch)) {
    return null
  }

  const span = findOriginalSpanForNormalizedSearch(beforeMarkdown, searchText)

  if (!span) {
    return null
  }

  return (
    beforeMarkdown.slice(0, span.start) +
    replaceText +
    beforeMarkdown.slice(span.end)
  )
}

function findMatchedSearchSpan(markdown: string, searchText: string) {
  if (markdown.includes(searchText)) {
    return searchText
  }

  const span = findOriginalSpanForNormalizedSearch(markdown, searchText)

  if (!span) {
    return null
  }

  return markdown.slice(span.start, span.end)
}

function findOriginalSpanForNormalizedSearch(
  original: string,
  searchText: string,
) {
  const normalizedSearch = normalizePatchText(searchText)

  if (!normalizedSearch) {
    return null
  }

  const maxWindow = Math.max(
    searchText.length * 3,
    normalizedSearch.length * 2,
    64,
  )

  for (let start = 0; start < original.length; start += 1) {
    const maxEnd = Math.min(original.length, start + maxWindow)

    for (let end = start + 1; end <= maxEnd; end += 1) {
      if (normalizePatchText(original.slice(start, end)) === normalizedSearch) {
        return { end, start }
      }
    }
  }

  return null
}

function normalizePatchLine(line: string) {
  return normalizePatchText(line)
}

function normalizePatchText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\[YouTube embed\]/gi, "[media:youtube]")
    .replace(/\[Embedded content\]/gi, "[media:embed]")
    .replace(/\[Video\]\([^)]*\)/gi, "[media:youtube]")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, url: string) => {
      return `[${label.trim().toLowerCase()}](${url.trim().toLowerCase()})`
    })
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .toLowerCase()
}

function validateFullPageReplacement(beforeMarkdown: string, afterMarkdown: string) {
  if (
    beforeMarkdown.length > 400 &&
    afterMarkdown.length < beforeMarkdown.length * MIN_FULL_PAGE_RETENTION_RATIO
  ) {
    return "The update removed too much of the page. Use editMode patch with searchText and replaceText to change only the section the user asked for."
  }

  for (const marker of STRUCTURAL_MARKERS) {
    const beforeCount = countMatches(beforeMarkdown, marker)
    const afterCount = countMatches(afterMarkdown, marker)

    if (beforeCount > 0 && afterCount < beforeCount) {
      return "The update removed embedded content, links, or databases. Use editMode patch to change only the requested section and preserve everything else."
    }
  }

  return null
}

function countMatches(value: string, pattern: RegExp) {
  return [...value.matchAll(pattern)].length
}

function buildFlexibleWhitespacePattern(searchText: string) {
  const parts = searchText
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))

  if (parts.length === 0) {
    return /$^/
  }

  return new RegExp(parts.join("\\s+"), "s")
}