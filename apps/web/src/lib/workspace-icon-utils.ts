export function isSvgIcon(value: string | null | undefined) {
  if (!value) {
    return false
  }

  return value.trim().startsWith("<svg")
}

export function normalizeSvgContent(content: string) {
  return content
    .replace(/\sfill="[^"]*"/gi, "")
    .replace(/\sfill='[^']*'/gi, "")
    .replace(/\sstyle="[^"]*"/gi, "")
    .replace(/\sstyle='[^']*'/gi, "")
}

export function getStoredIconColor(svg: string) {
  const dataColorMatch = svg.match(/data-icon-color="([^"]+)"/i)

  return dataColorMatch?.[1] ?? "default"
}

export function buildColoredIconSvg({
  viewBox,
  content,
  color,
}: {
  viewBox: string
  content: string
  color: string
}) {
  const normalizedContent = normalizeSvgContent(content)
  const colorValue = color || "default"

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="1em" height="1em" fill="currentColor" data-icon-color="${colorValue}">${normalizedContent}</svg>`
}

export function buildStoredSvgFromRenderedSvg({
  color,
  svg,
}: {
  color: string
  svg: string
}) {
  const sanitized = sanitizeStoredSvg(svg)

  if (!sanitized) {
    return ""
  }

  const viewBoxMatch = sanitized.match(/viewBox="([^"]+)"/i)
  const viewBox = viewBoxMatch?.[1] ?? "0 0 24 24"
  const content = sanitized
    .replace(/<svg[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "")
    .replace(/\sclass="[^"]*"/gi, "")
    .replace(/\saria-hidden="[^"]*"/gi, "")
    .replace(/\srole="[^"]*"/gi, "")
    .trim()

  if (!content) {
    return ""
  }

  const colorValue = color || "default"

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-icon-color="${colorValue}">${content}</svg>`
}

export function parseUploadedSvg(raw: string) {
  const sanitized = sanitizeStoredSvg(raw)

  if (!sanitized) {
    return null
  }

  const viewBoxMatch = sanitized.match(/viewBox="([^"]+)"/i)
  const widthMatch = sanitized.match(/\bwidth="([\d.]+)"/i)
  const heightMatch = sanitized.match(/\bheight="([\d.]+)"/i)
  const viewBox =
    viewBoxMatch?.[1] ??
    (widthMatch && heightMatch
      ? `0 0 ${widthMatch[1]} ${heightMatch[1]}`
      : "0 0 24 24")
  const content = normalizeSvgContent(
    sanitized
      .replace(/<svg[^>]*>/i, "")
      .replace(/<\/svg>\s*$/i, "")
      .trim(),
  )

  if (!content) {
    return null
  }

  return { viewBox, content }
}

export function sanitizeStoredSvg(value: string) {
  const trimmed = value.trim()

  if (!trimmed.startsWith("<svg") || !trimmed.endsWith("</svg>")) {
    return ""
  }

  if (/<script|on\w+=|javascript:/i.test(trimmed)) {
    return ""
  }

  return trimmed
}
