type PageBodyNode = {
  content?: unknown;
  text?: unknown;
  type?: unknown;
};

export function isPageBodyEmpty(content: unknown): boolean {
  if (content == null) {
    return true;
  }

  if (typeof content === "string") {
    const trimmed = content.trim();

    if (!trimmed) {
      return true;
    }

    try {
      return isPageBodyEmpty(JSON.parse(trimmed) as unknown);
    } catch {
      return false;
    }
  }

  if (Array.isArray(content)) {
    return content.every(isPageBodyEmpty);
  }

  if (typeof content !== "object") {
    return false;
  }

  const node = content as PageBodyNode;

  if (node.type === "text") {
    return typeof node.text !== "string" || node.text.trim().length === 0;
  }

  if (
    node.type === "hardBreak" ||
    node.type === "paragraph" ||
    node.type === "heading" ||
    node.type === "doc" ||
    !node.type
  ) {
    return isPageBodyEmpty(node.content);
  }

  return false;
}

export function hasPageBodyContent(content: unknown): boolean {
  return !isPageBodyEmpty(content);
}
