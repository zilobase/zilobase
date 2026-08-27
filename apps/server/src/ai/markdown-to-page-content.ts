type PageContentNode = {
  attrs?: Record<string, unknown>;
  content?: PageContentNode[];
  marks?: Array<{ attrs?: Record<string, unknown>; type: string }>;
  text?: string;
  type: string;
};

export function markdownToPageContent(markdown: string) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const content: PageContentNode[] = [];
  let index = 0;
  let taskListHeadingActive = false;

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
        content: inlineContent(heading[2]!),
        type: "heading",
      });
      taskListHeadingActive = isTaskListHeading(heading[2]!);
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
      taskListHeadingActive = false;
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items: PageContentNode[] = [];

      while (index < lines.length) {
        const match = lines[index]!.trim().match(/^[-*+]\s+(.+)$/);

        if (!match) break;
        items.push({
          ...(taskListHeadingActive ? { attrs: { checked: false } } : {}),
          content: [paragraph(match[1]!)],
          type: taskListHeadingActive ? "taskItem" : "listItem",
        });
        index += 1;
      }

      content.push({
        content: items,
        type: taskListHeadingActive ? "taskList" : "bulletList",
      });
      taskListHeadingActive = false;
      continue;
    }

    taskListHeadingActive = false;

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

function isTaskListHeading(value: string) {
  return /\b(?:checklist|tasks?|to[- ]?do)\b/i.test(value);
}

function startsBlock(line: string) {
  return /^(?:```|#{1,6}\s|[-*+]\s|\d+\.\s|>\s?|(?:[-*_]\s*){3,}$)/.test(
    line,
  );
}

function paragraph(text: string): PageContentNode {
  return {
    content: inlineContent(text),
    type: "paragraph",
  };
}

function inlineContent(text: string): PageContentNode[] | undefined {
  if (!text) return undefined;

  const nodes: PageContentNode[] = [];
  const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g;
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push({ text: text.slice(cursor, index), type: "text" });
    }
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push({
        marks: [{ type: "bold" }],
        text: token.slice(2, -2),
        type: "text",
      });
    } else if (token.startsWith("`")) {
      nodes.push({
        marks: [{ type: "code" }],
        text: token.slice(1, -1),
        type: "text",
      });
    } else {
      nodes.push({
        marks: [{ type: "italic" }],
        text: token.slice(1, -1),
        type: "text",
      });
    }
    cursor = index + token.length;
  }

  if (cursor < text.length) {
    nodes.push({ text: text.slice(cursor), type: "text" });
  }

  return nodes.length > 0 ? nodes : undefined;
}

function textContent(text: string): PageContentNode[] | undefined {
  return text ? [{ text, type: "text" }] : undefined;
}
