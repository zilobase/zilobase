type PageContentNode = {
  content?: PageContentNode[]
  text?: string
  type?: string
}

export function isEffectivelyEmptyPageContent(content: unknown): boolean {
  if (content == null) {
    return true
  }

  if (typeof content === "string") {
    const trimmed = content.trim()
    if (!trimmed) {
      return true
    }

    try {
      return isEffectivelyEmptyPageContent(JSON.parse(trimmed) as unknown)
    } catch {
      return false
    }
  }

  if (typeof content !== "object" || Array.isArray(content)) {
    return false
  }

  return isEffectivelyEmptyNode(content as PageContentNode)
}

function isEffectivelyEmptyNode(node: PageContentNode): boolean {
  if (node.type === "text") {
    return !node.text?.trim()
  }

  if (
    node.type === "hardBreak" ||
    node.type === "paragraph" ||
    node.type === "heading" ||
    node.type === "doc" ||
    !node.type
  ) {
    return (node.content ?? []).every(isEffectivelyEmptyNode)
  }

  return false
}
