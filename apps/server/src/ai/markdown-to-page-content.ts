type PageContentNode = {
  attrs?: Record<string, unknown>;
  content?: PageContentNode[];
  text?: string;
  type: string;
};

export function markdownToPageContent(markdown: string) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const content: PageContentNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const fence = trimmed.match(/^```([^`]*)$/);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !/^```\s*$/.test(lines[index]!.trim())) {
        codeLines.push(lines[index]!);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      content.push({
        attrs: { language: fence[1]?.trim() || null },
        content: textContent(codeLines.join("\n")),
        type: "codeBlock",
      });
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      content.push({
        attrs: { level: heading[1]!.length },
        content: textContent(heading[2]!),
        type: "heading",
      });
      index += 1;
      continue;
    }

    if (/^(?:[-*_]\s*){3,}$/.test(trimmed)) {
      content.push({ type: "horizontalRule" });
      index += 1;
      continue;
    }

    if (/^[-*+]\s+\[[ xX]\]\s+/.test(trimmed)) {
      const items: PageContentNode[] = [];

      while (index < lines.length) {
        const match = lines[index]!.trim().match(
          /^[-*+]\s+\[([ xX])\]\s+(.+)$/,
        );

        if (!match) break;
        items.push({
          attrs: { checked: match[1]!.toLowerCase() === "x" },
          content: [paragraph(match[2]!)],
          type: "taskItem",
        });
        index += 1;
      }

      content.push({ content: items, type: "taskList" });
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items: PageContentNode[] = [];

      while (index < lines.length) {
        const match = lines[index]!.trim().match(/^[-*+]\s+(.+)$/);

        if (!match) break;
        items.push({ content: [paragraph(match[1]!)], type: "listItem" });
        index += 1;
      }

      content.push({ content: items, type: "bulletList" });
      continue;
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      const items: PageContentNode[] = [];
      const start = Number(orderedMatch[1]);

      while (index < lines.length) {
        const match = lines[index]!.trim().match(/^\d+\.\s+(.+)$/);

        if (!match) break;
        items.push({ content: [paragraph(match[1]!)], type: "listItem" });
        index += 1;
      }

      content.push({ attrs: { start }, content: items, type: "orderedList" });
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = [];

      while (index < lines.length && /^>\s?/.test(lines[index]!.trim())) {
        quoteLines.push(lines[index]!.trim().replace(/^>\s?/, ""));
        index += 1;
      }

      content.push({
        content: [paragraph(quoteLines.join("\n"))],
        type: "blockquote",
      });
      continue;
    }

    const paragraphLines = [line];
    index += 1;

    while (
      index < lines.length &&
      lines[index]!.trim() &&
      !startsBlock(lines[index]!.trim())
    ) {
      paragraphLines.push(lines[index]!);
      index += 1;
    }

    content.push(paragraph(paragraphLines.join("\n")));
  }

  return {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}

function startsBlock(line: string) {
  return /^(?:```|#{1,6}\s|[-*+]\s|\d+\.\s|>\s?|(?:[-*_]\s*){3,}$)/.test(
    line,
  );
}

function paragraph(text: string): PageContentNode {
  return {
    content: textContent(text),
    type: "paragraph",
  };
}

function textContent(text: string): PageContentNode[] | undefined {
  return text ? [{ text, type: "text" }] : undefined;
}
