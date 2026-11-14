import type { PageDocumentNode } from "../document/page-document";

type BlockSerializer = (node: PageDocumentNode) => string;

export function prosemirrorToMarkdown(content: unknown): string {
  if (content === null || content === undefined) {
    return "";
  }

  if (typeof content !== "object" || Array.isArray(content)) {
    return "";
  }

  const node = content as PageDocumentNode;

  if (node.type === "doc") {
    return serializeBlocks(node.content ?? []);
  }

  return serializeBlocks([node]).trim();
}

function serializeBlocks(nodes: PageDocumentNode[]) {
  const parts: string[] = [];

  for (const node of nodes) {
    const serialized = serializeBlock(node);

    if (serialized) {
      parts.push(serialized);
    }
  }

  return parts.join("\n\n").trim();
}

function stringAttr(attrs: Record<string, unknown> | undefined, key: string): string {
  return typeof attrs?.[key] === "string" ? attrs[key] : "";
}

function trimmedStringAttr(
  attrs: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
): string {
  const value = stringAttr(attrs, key).trim();
  return value || fallback;
}

function serializeParagraph(node: PageDocumentNode) {
  return serializeInline(node.content ?? []);
}

function serializeHeading(node: PageDocumentNode) {
  const level =
    typeof node.attrs?.level === "number" ? Math.min(Math.max(node.attrs.level, 1), 6) : 1;

  return `${"#".repeat(level)} ${serializeInline(node.content ?? [])}`.trim();
}

function serializeBlockquote(node: PageDocumentNode) {
  return (node.content ?? [])
    .map((child) =>
      serializeBlock(child)
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n"),
    )
    .join("\n");
}

function serializeCodeBlock(node: PageDocumentNode) {
  const language = stringAttr(node.attrs, "language");
  const code = (node.content ?? []).map((child) => child.text ?? "").join("");
  const fence = "`".repeat(
    Math.max(3, ...[...code.matchAll(/`+/g)].map(([run]) => run.length + 1)),
  );
  return `${fence}${language}\n${code}\n${fence}`;
}

function serializeDatabaseBlock(node: PageDocumentNode) {
  const databaseId = stringAttr(node.attrs, "databaseId");
  const label = databaseId ? `Database (${databaseId})` : "Database";
  return `[${label}]`;
}

function serializeMeetingBlock(node: PageDocumentNode) {
  const meetingId = stringAttr(node.attrs, "meetingId");
  return meetingId ? `[Meeting (${meetingId})]` : "[Meeting]";
}

function serializePageBlock(node: PageDocumentNode) {
  const pageId = stringAttr(node.attrs, "pageId");
  const title = trimmedStringAttr(node.attrs, "title", "Untitled page");
  return pageId ? `[Page: ${title} (${pageId})]` : `[Page: ${title}]`;
}

function serializeImageBlock(node: PageDocumentNode) {
  const src = stringAttr(node.attrs, "src");
  const alt = trimmedStringAttr(node.attrs, "alt", "image");
  return src ? `![${alt}](${src})` : `![${alt}]`;
}

function serializeVideoBlock(node: PageDocumentNode) {
  const src = stringAttr(node.attrs, "src");
  return src ? `[Video](${src})` : "[Video]";
}

function serializeEmbedBlock(node: PageDocumentNode) {
  const url = stringAttr(node.attrs, "url");
  const title = trimmedStringAttr(node.attrs, "title", "Embed");
  return url ? `[${title}](${url})` : `[${title}]`;
}

function serializeFileBlock(node: PageDocumentNode) {
  const name = trimmedStringAttr(
    node.attrs,
    "title",
    trimmedStringAttr(node.attrs, "name", "File"),
  );
  const url = stringAttr(node.attrs, "href") || stringAttr(node.attrs, "url");
  return url ? `[File: ${name}](${url})` : `[File: ${name}]`;
}

function serializeBookmarkBlock(node: PageDocumentNode) {
  const url = stringAttr(node.attrs, "url");
  const title = trimmedStringAttr(node.attrs, "title", url || "Bookmark");
  return url ? `[${title}](${url})` : `[${title}]`;
}

function serializeLinkMention(node: PageDocumentNode) {
  const href = stringAttr(node.attrs, "href");
  const title = trimmedStringAttr(node.attrs, "title", href || "Link");
  return href ? `[${title}](${href})` : title;
}

function serializeDetailsSummary(node: PageDocumentNode) {
  const summary = serializeInline(node.content ?? []);
  return summary ? `**${summary}**` : "";
}

function serializeNestedBlocks(node: PageDocumentNode) {
  return serializeBlocks(node.content ?? []);
}

function serializeDefaultBlock(node: PageDocumentNode) {
  if (node.content?.length) {
    return `[Unsupported block: ${node.type ?? "unknown"}]\n${serializeBlocks(node.content)}`;
  }

  return `[Unsupported block: ${node.type ?? "unknown"}]`;
}

const BLOCK_SERIALIZERS: Record<string, BlockSerializer> = {
  callout: serializeBlockquote,
  tabsBlock: serializeNestedBlocks,
  tabPanel: (node) =>
    `${stringAttr(node.attrs, "title") || "Tab"}\n\n${serializeNestedBlocks(node)}`,
  askAiBlock: (node) => `[Ask AI: ${stringAttr(node.attrs, "prompt")}]`,
  inlineMath: (node) => `$${stringAttr(node.attrs, "latex")}$`,
  blockMath: (node) => `$$\n${stringAttr(node.attrs, "latex")}\n$$`,
  blockquote: serializeBlockquote,
  bookmarkBlock: serializeBookmarkBlock,
  bulletList: (node) => serializeList(node.content ?? [], "- "),
  codeBlock: serializeCodeBlock,
  column: serializeNestedBlocks,
  columnBlock: serializeNestedBlocks,
  columnsExtension: serializeNestedBlocks,
  databaseBlock: serializeDatabaseBlock,
  details: serializeNestedBlocks,
  detailsContent: serializeNestedBlocks,
  detailsSummary: serializeDetailsSummary,
  embedBlock: serializeEmbedBlock,
  fileBlock: serializeFileBlock,
  heading: serializeHeading,
  horizontalRule: () => "---",
  imageBlock: serializeImageBlock,
  linkMention: serializeLinkMention,
  meetingBlock: serializeMeetingBlock,
  orderedList: (node) =>
    serializeOrderedList(
      node.content ?? [],
      typeof node.attrs?.start === "number" ? node.attrs.start : 1,
    ),
  pageBlock: serializePageBlock,
  paragraph: serializeParagraph,
  table: (node) => serializeTable(node.content ?? []),
  tableOfContentsBlock: () => "[Table of contents]",
  taskList: (node) => serializeTaskList(node.content ?? []),
  text: (node) => applyMarks(node.text ?? "", node.marks ?? []),
  videoBlock: serializeVideoBlock,
};

function serializeBlock(node: PageDocumentNode): string {
  const serializer = node.type ? BLOCK_SERIALIZERS[node.type] : undefined;
  return serializer ? serializer(node) : serializeDefaultBlock(node);
}

function serializeList(nodes: PageDocumentNode[], marker: string) {
  return nodes
    .map((node) => {
      if (node.type !== "listItem" && node.type !== "taskItem") {
        return serializeBlock(node);
      }

      const content = serializeBlocks(node.content ?? []);
      return `${marker}${content.replace(/\n/g, "\n  ")}`;
    })
    .join("\n");
}

function serializeOrderedList(nodes: PageDocumentNode[], start: number) {
  return nodes
    .map((node, index) => {
      if (node.type !== "listItem") {
        return serializeBlock(node);
      }

      const content = serializeBlocks(node.content ?? []);
      const marker = `${start + index}. `;
      return `${marker}${content.replace(/\n/g, `\n${" ".repeat(marker.length)}`)}`;
    })
    .join("\n");
}

function serializeTaskList(nodes: PageDocumentNode[]) {
  return nodes
    .map((node) => {
      const checked = node.attrs?.checked === true;
      const content = serializeBlocks(node.content ?? []);
      return `- [${checked ? "x" : " "}] ${content}`;
    })
    .join("\n");
}

function serializeTable(rows: PageDocumentNode[]) {
  const tableRows = rows
    .filter((row) => row.type === "tableRow")
    .map((row) =>
      (row.content ?? [])
        .filter((cell) => cell.type === "tableCell" || cell.type === "tableHeader")
        .map((cell) =>
          serializeBlocks(cell.content ?? [])
            .replace(/\|/g, "\\|")
            .replace(/\n/g, "<br>"),
        ),
    );

  if (tableRows.length === 0) {
    return "";
  }

  const header = tableRows[0];
  const divider = header.map(() => "---");
  const body = tableRows.slice(1);

  return [
    `| ${header.join(" | ")} |`,
    `| ${divider.join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function serializeInline(nodes: PageDocumentNode[]) {
  return nodes
    .map((node) => {
      if (node.type === "hardBreak") {
        return "\n";
      }

      if (node.type === "text") {
        return applyMarks(node.text ?? "", node.marks ?? []);
      }

      if (node.type === "emoji") {
        return typeof node.attrs?.emoji === "string" ? node.attrs.emoji : "";
      }

      return serializeBlock(node);
    })
    .join("");
}

function applyMarks(text: string, marks: Array<{ attrs?: Record<string, unknown>; type: string }>) {
  return marks.reduce((current, mark) => {
    switch (mark.type) {
      case "bold":
      case "strong":
        return `**${current}**`;
      case "italic":
      case "em":
        return `*${current}*`;
      case "strike":
        return `~~${current}~~`;
      case "code":
        return `\`${current}\``;
      case "link": {
        const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : undefined;
        return href ? `[${current}](${href})` : current;
      }
      default:
        return current;
    }
  }, text);
}
