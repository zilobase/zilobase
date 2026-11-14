import { blockTemplate } from "../blocks/block-templates";
import { createDatabaseBlockNodes } from "../database/insert-database-block";
import type { PageDocumentNode } from "../document/page-document";

/*
 * Zilobase-flavored Markdown (ZFM) to a page document. It accepts what
 * `prosemirrorToMarkdown` writes plus directives for container blocks:
 *
 *   :::callout 💡        :::toggle Summary     :::tabs            :::columns
 *   Body                 Body                  :::tab First       :::column
 *   :::                  :::                   Body               Left
 *                                              :::                :::
 *                                              :::                :::
 *
 * Standalone lines become structural blocks: `[Database (id)]`,
 * `[Database: Title]`, `[Page: Title (id)]`, `[Page: Title]`, `[Meeting (id)]`,
 * `[Table of contents]`, `![alt](src)`, `[Video](src)`, `[File: name](href)`,
 * `[Embed: title](src)` and `[Bookmark: title](href)`. Titles without IDs are
 * passed to the resolvers so planners can create the referenced page or database.
 */

type Node = PageDocumentNode & {
  marks?: Mark[];
  text?: string;
};
type Mark = { type: string; attrs?: Record<string, unknown> };

export type MarkdownResolvers = {
  /** Returns the ID of a subpage to create or link for `[Page: Title]`. */
  page?: (title: string) => string | null | undefined;
  /** Returns the ID of an inline database to create for `[Database: Title]`. */
  database?: (title: string) => string | null | undefined;
};

export function markdownToPageDocument(markdown: string, resolvers: MarkdownResolvers = {}) {
  const content = parseBlocks(markdown.replace(/\r\n?/g, "\n").split("\n"), resolvers);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] } as Node;
}

const FENCE = /^(`{3,}|~{3,})\s*([^`\s]*)\s*$/;
const DIRECTIVE = /^:::\s*([a-z]+)\s*(.*)$/i;
const DIRECTIVE_END = /^:::\s*$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^(?:[-*_]\s*){3,}$/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;
const TABLE_DIVIDER = /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

function parseBlocks(lines: string[], resolvers: MarkdownResolvers): Node[] {
  const nodes: Node[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const fence = trimmed.match(FENCE);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !closesFence(lines[index]!, fence[1]!))
        code.push(lines[index++]!);
      index += 1;
      nodes.push({
        type: "codeBlock",
        attrs: { language: fence[2] || null },
        ...(code.length ? { content: [{ type: "text", text: code.join("\n") }] } : {}),
      });
      continue;
    }

    if (trimmed === "$$") {
      const latex: string[] = [];
      index += 1;
      while (index < lines.length && lines[index]!.trim() !== "$$") latex.push(lines[index++]!);
      index += 1;
      nodes.push({ type: "blockMath", attrs: { latex: latex.join("\n").trim() } });
      continue;
    }

    const directive = trimmed.match(DIRECTIVE);
    if (directive) {
      const end = directiveEnd(lines, index);
      nodes.push(
        ...containerBlock(
          directive[1]!.toLowerCase(),
          directive[2]!.trim(),
          lines.slice(index + 1, end),
          resolvers,
        ),
      );
      index = end + 1;
      continue;
    }

    if (/^<details>/i.test(trimmed)) {
      const end = detailsEnd(lines, index);
      const inner = lines.slice(index, end + 1).join("\n");
      const body = inner.replace(/^\s*<details>\s*/i, "").replace(/\s*<\/details>\s*$/i, "");
      const summary = body.match(/^\s*<summary>([\s\S]*?)<\/summary>/i);
      nodes.push(
        ...containerBlock(
          "toggle",
          summary?.[1]?.trim() ?? "",
          (summary ? body.slice(summary[0].length) : body).split("\n"),
          resolvers,
        ),
      );
      index = end + 1;
      continue;
    }

    const heading = trimmed.match(HEADING);
    if (heading) {
      nodes.push({
        type: "heading",
        attrs: { level: Math.min(heading[1]!.length, 4) },
        ...inlineContent(heading[2]!),
      });
      index += 1;
      continue;
    }

    if (RULE.test(trimmed)) {
      nodes.push({ type: "horizontalRule" });
      index += 1;
      continue;
    }

    if (trimmed.startsWith("|") && TABLE_DIVIDER.test(lines[index + 1]?.trim() ?? "")) {
      const rows = [line];
      index += 2;
      while (index < lines.length && lines[index]!.trim().startsWith("|"))
        rows.push(lines[index++]!);
      nodes.push(table(rows));
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoted: string[] = [];
      while (index < lines.length && lines[index]!.trim().startsWith(">"))
        quoted.push(lines[index++]!.trim().replace(/^>\s?/, ""));
      nodes.push(quote(quoted, resolvers));
      continue;
    }

    if (LIST_ITEM.test(line)) {
      index = list(lines, index, nodes, resolvers);
      continue;
    }

    const structural = structuralBlock(trimmed, resolvers);
    if (structural) {
      nodes.push(...structural);
      index += 1;
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index]!.trim() &&
      (!paragraph.length || !startsBlock(lines, index))
    )
      paragraph.push(lines[index++]!.trim());
    nodes.push(paragraphNode(paragraph));
  }
  return nodes;
}

const ALERT_ICONS: Record<string, string> = {
  note: "ℹ️",
  tip: "💡",
  important: "❗",
  warning: "⚠️",
  caution: "🛑",
};
const LEADING_EMOJI = /^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s+/u;

/** Quotes, except GitHub alerts (`> [!TIP]`) and emoji-led quotes, which models write for callouts. */
function quote(lines: string[], resolvers: MarkdownResolvers): Node {
  const alert = lines[0]?.trim().match(/^\[!(note|tip|important|warning|caution)\]\s*(.*)$/i);
  if (alert) {
    const body = alert[2] ? [alert[2], ...lines.slice(1)] : lines.slice(1);
    return callout(ALERT_ICONS[alert[1]!.toLowerCase()]!, body, resolvers);
  }
  const emoji = lines[0]?.match(LEADING_EMOJI);
  if (emoji)
    return callout(emoji[1]!, [lines[0]!.slice(emoji[0].length), ...lines.slice(1)], resolvers);
  return { type: "blockquote", content: nonEmpty(parseBlocks(lines, resolvers)) };
}

function callout(icon: string, lines: string[], resolvers: MarkdownResolvers): Node {
  return { type: "callout", attrs: { icon }, content: nonEmpty(parseBlocks(lines, resolvers)) };
}

function detailsEnd(lines: string[], start: number) {
  let depth = 0;
  for (let index = start; index < lines.length; index += 1) {
    depth += (lines[index]!.match(/<details>/gi) ?? []).length;
    depth -= (lines[index]!.match(/<\/details>/gi) ?? []).length;
    if (depth <= 0) return index;
  }
  return lines.length - 1;
}

function closesFence(line: string, fence: string) {
  const trimmed = line.trim();
  return trimmed.length >= fence.length && trimmed === fence[0]!.repeat(trimmed.length);
}

function directiveEnd(lines: string[], start: number) {
  let depth = 0;
  for (let index = start; index < lines.length; index += 1) {
    const trimmed = lines[index]!.trim();
    if (DIRECTIVE.test(trimmed)) depth += 1;
    else if (DIRECTIVE_END.test(trimmed) && --depth === 0) return index;
  }
  return lines.length;
}

function startsBlock(lines: string[], index: number) {
  const line = lines[index]!;
  const trimmed = line.trim();
  return (
    FENCE.test(trimmed) ||
    trimmed === "$$" ||
    DIRECTIVE.test(trimmed) ||
    DIRECTIVE_END.test(trimmed) ||
    /^<details>/i.test(trimmed) ||
    HEADING.test(trimmed) ||
    RULE.test(trimmed) ||
    trimmed.startsWith(">") ||
    LIST_ITEM.test(line) ||
    (trimmed.startsWith("|") && TABLE_DIVIDER.test(lines[index + 1]?.trim() ?? "")) ||
    structuralBlock(trimmed, {}) !== null
  );
}

function nonEmpty(nodes: Node[]): Node[] {
  return nodes.length ? nodes : [{ type: "paragraph" }];
}

function paragraphNode(lines: string[]): Node {
  const content: Node[] = [];
  lines.forEach((line, index) => {
    if (index) content.push({ type: "hardBreak" });
    content.push(...(inlineContent(line.replace(/(?: {2,}|\\)$/, "")).content ?? []));
  });
  return { type: "paragraph", ...(content.length ? { content } : {}) };
}

function containerBlock(
  name: string,
  argument: string,
  inner: string[],
  resolvers: MarkdownResolvers,
): Node[] {
  switch (name) {
    case "callout":
      return [callout(argument || "💡", inner, resolvers)];
    case "toggle":
    case "details":
      return [
        {
          type: "details",
          content: [
            { type: "detailsSummary", ...inlineContent(argument || "Toggle") },
            { type: "detailsContent", content: nonEmpty(parseBlocks(inner, resolvers)) },
          ],
        },
      ];
    case "tabs":
      return [
        {
          type: "tabsBlock",
          content: children(parseBlocks(inner, resolvers), "tabPanel", (content, index) => ({
            type: "tabPanel",
            attrs: { title: `Tab ${index + 1}` },
            content,
          })),
        },
      ];
    case "tab":
      return [
        {
          type: "tabPanel",
          attrs: { title: argument || "Tab" },
          content: nonEmpty(parseBlocks(inner, resolvers)),
        },
      ];
    case "columns":
      return [
        {
          type: "columnBlock",
          content: children(parseBlocks(inner, resolvers), "column", (content) => ({
            type: "column",
            content,
          })),
        },
      ];
    case "column":
      return [{ type: "column", content: nonEmpty(parseBlocks(inner, resolvers)) }];
    default:
      return parseBlocks(inner, resolvers);
  }
}

/** Keeps a container's typed children; stray blocks are grouped into another child. */
function children(nodes: Node[], type: string, wrap: (content: Node[], index: number) => Node) {
  const result: Node[] = [];
  let stray: Node[] = [];
  const flush = () => {
    if (stray.length) result.push(wrap(stray, result.length));
    stray = [];
  };
  for (const node of nodes) {
    if (node.type !== type) {
      stray.push(node);
      continue;
    }
    flush();
    result.push(node);
  }
  flush();
  return result.length ? result : [wrap([{ type: "paragraph" }], 0)];
}

function list(lines: string[], start: number, nodes: Node[], resolvers: MarkdownResolvers) {
  const first = lines[start]!.match(LIST_ITEM)!;
  const indent = first[1]!.length;
  const kind =
    first[3] !== undefined ? "taskList" : /\d/.test(first[2]!) ? "orderedList" : "bulletList";
  const items: Node[] = [];
  let index = start;
  while (index < lines.length) {
    const match = lines[index]!.match(LIST_ITEM);
    if (!match || match[1]!.length !== indent) break;
    const itemKind =
      match[3] !== undefined ? "taskList" : /\d/.test(match[2]!) ? "orderedList" : "bulletList";
    if (itemKind !== kind) break;
    const body = [match[4]!];
    index += 1;
    const contentIndent = indent + 1;
    while (index < lines.length) {
      const next = lines[index]!;
      if (!next.trim()) {
        const following = lines.slice(index + 1).find((candidate) => candidate.trim());
        if (!following || leading(following) < contentIndent + 1) break;
        body.push("");
        index += 1;
        continue;
      }
      if (leading(next) <= indent) break;
      body.push(next.slice(Math.min(leading(next), indent + 2)));
      index += 1;
    }
    const content = nonEmpty(parseBlocks(body, resolvers));
    if (content[0]!.type !== "paragraph") content.unshift({ type: "paragraph" });
    items.push(
      kind === "taskList"
        ? { type: "taskItem", attrs: { checked: match[3] !== " " }, content }
        : { type: "listItem", content },
    );
  }
  nodes.push({
    type: kind,
    ...(kind === "orderedList" ? { attrs: { start: Number.parseInt(first[2]!, 10) || 1 } } : {}),
    content: items,
  });
  return index;
}

function leading(line: string) {
  return line.length - line.trimStart().length;
}

function table(rows: string[]): Node {
  const cells = (row: string) =>
    row
      .trim()
      .replace(/^\|/, "")
      .replace(/(?<!\\)\|$/, "")
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim().replace(/\\\|/g, "|"));
  const width = Math.max(...rows.map((row) => cells(row).length));
  return {
    type: "table",
    content: rows.map((row, rowIndex) => {
      const values = cells(row);
      return {
        type: "tableRow",
        content: Array.from({ length: width }, (_, column) => ({
          type: rowIndex === 0 ? "tableHeader" : "tableCell",
          content: [paragraphNode((values[column] ?? "").split(/<br\s*\/?>/i))],
        })),
      };
    }),
  };
}

function embedProvider(src: string) {
  const host = (() => {
    try {
      return new URL(src).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) return "youtube";
  if (/(^|\.)figma\.com$/.test(host)) return "figma";
  if (/(^|\.)miro\.com$/.test(host)) return "miro";
  if (/(^|\.)excalidraw\.com$/.test(host)) return "excalidraw";
  return null;
}

function structuralBlock(line: string, resolvers: MarkdownResolvers): Node[] | null {
  let match = line.match(new RegExp(`^\\[Database\\s*\\((${UUID})\\)\\]$`, "i"));
  if (match) return createDatabaseBlockNodes(match[1]!) as Node[];
  match = line.match(/^\[Database:\s*(.+?)\]$/i);
  if (match) {
    const id = resolvers.database?.(match[1]!);
    return id ? (createDatabaseBlockNodes(id) as Node[]) : null;
  }
  match = line.match(new RegExp(`^\\[Page:\\s*(.+?)\\s*\\((${UUID})\\)\\]$`, "i"));
  if (match) return [{ type: "pageBlock", attrs: { pageId: match[2]! } }];
  match = line.match(/^\[Page:\s*(.+?)\]$/i);
  if (match) {
    const id = resolvers.page?.(match[1]!);
    return id ? [{ type: "pageBlock", attrs: { pageId: id } }] : null;
  }
  match = line.match(new RegExp(`^\\[Meeting\\s*\\((${UUID})\\)\\]$`, "i"));
  if (match) return [{ type: "meetingBlock", attrs: { meetingId: match[1]! } }];
  if (/^(?:\[Table of contents\]|\[TOC\]|\[\[_?TOC_?\]\]|\$\{toc\})$/i.test(line))
    return [blockTemplate({ id: "tableOfContentsBlock" }) as Node];
  match = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
  if (match) return [{ type: "imageBlock", attrs: { src: match[2]!, alt: match[1] || null } }];
  match = line.match(/^\[Video(?::\s*(.+?))?\]\(([^)\s]+)\)$/i);
  if (match) return [{ type: "videoBlock", attrs: { src: match[2]!, title: match[1] ?? null } }];
  match = line.match(/^\[File:\s*(.+?)\]\(([^)\s]+)\)$/i);
  if (match) return [{ type: "fileBlock", attrs: { href: match[2]!, title: match[1]! } }];
  match = line.match(/^\[Embed(?::\s*(.+?))?\]\(([^)\s]+)\)$/i);
  if (match)
    return [
      {
        type: "embedBlock",
        attrs: { src: match[2]!, title: match[1] ?? null, provider: embedProvider(match[2]!) },
      },
    ];
  match = line.match(/^\[Bookmark(?::\s*(.+?))?\]\(([^)\s]+)\)$/i);
  if (match)
    return [{ type: "bookmarkBlock", attrs: { href: match[2]!, title: match[1] ?? null } }];
  return null;
}

/* Inline Markdown: escapes, code, bold, italic, strike, underline and links. */

export function inlineContent(text: string): { content?: Node[] } {
  const content = mergeText(parseInline(text, []));
  return content.length ? { content } : {};
}

const DELIMITERS: Array<[string, Mark["type"]]> = [
  ["**", "bold"],
  ["__", "bold"],
  ["~~", "strike"],
  ["*", "italic"],
  ["_", "italic"],
];

function parseInline(text: string, marks: Mark[]): Node[] {
  const nodes: Node[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) nodes.push(textNode(buffer, marks));
    buffer = "";
  };
  let index = 0;
  while (index < text.length) {
    const rest = text.slice(index);
    const char = text[index]!;
    if (char === "\\" && index + 1 < text.length && /[\\`*_~[\]()<>|#!$-]/.test(text[index + 1]!)) {
      buffer += text[index + 1];
      index += 2;
      continue;
    }
    if (char === "`") {
      const run = rest.match(/^`+/)![0];
      const close = text.indexOf(run, index + run.length);
      if (close > index) {
        flush();
        nodes.push(textNode(text.slice(index + run.length, close), [...marks, { type: "code" }]));
        index = close + run.length;
        continue;
      }
    }
    const link = rest.match(/^\[((?:\\.|[^\]\\])+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/);
    if (link) {
      flush();
      nodes.push(...parseInline(link[1]!, [...marks, { type: "link", attrs: { href: link[2]! } }]));
      index += link[0].length;
      continue;
    }
    const autolink = rest.match(/^<(https?:\/\/[^>\s]+)>/);
    if (autolink) {
      flush();
      nodes.push(
        textNode(autolink[1]!, [...marks, { type: "link", attrs: { href: autolink[1]! } }]),
      );
      index += autolink[0].length;
      continue;
    }
    const underline = rest.match(/^<u>([\s\S]+?)<\/u>/);
    if (underline) {
      flush();
      nodes.push(...parseInline(underline[1]!, [...marks, { type: "underline" }]));
      index += underline[0].length;
      continue;
    }
    const delimiter = DELIMITERS.find(([token]) => rest.startsWith(token));
    if (delimiter && !marks.some((mark) => mark.type === delimiter[1])) {
      const [token, type] = delimiter;
      const close = closingDelimiter(text, index + token.length, token);
      const opensWord = /\S/.test(text[index + token.length] ?? "");
      const intraword = token[0] === "_" && /\w/.test(text[index - 1] ?? "");
      if (close > index + token.length && opensWord && !intraword) {
        flush();
        nodes.push(...parseInline(text.slice(index + token.length, close), [...marks, { type }]));
        index = close + token.length;
        continue;
      }
    }
    buffer += char;
    index += 1;
  }
  flush();
  return nodes;
}

function closingDelimiter(text: string, from: number, token: string) {
  for (let index = from; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
      continue;
    }
    if (text[index] === "`") {
      const close = text.indexOf("`", index + 1);
      if (close > index) index = close;
      continue;
    }
    if (!text.startsWith(token, index) || !/\S/.test(text[index - 1] ?? "")) continue;
    if (token.length === 1 && text[index + 1] === token) {
      index += 1;
      continue;
    }
    if (token[0] === "_" && /\w/.test(text[index + token.length] ?? "")) continue;
    return index;
  }
  return -1;
}

function textNode(text: string, marks: Mark[]): Node {
  return marks.length ? { type: "text", text, marks } : { type: "text", text };
}

function mergeText(nodes: Node[]) {
  const merged: Node[] = [];
  for (const node of nodes) {
    const previous = merged.at(-1);
    if (
      previous?.type === "text" &&
      node.type === "text" &&
      JSON.stringify(previous.marks ?? []) === JSON.stringify(node.marks ?? [])
    )
      previous.text = `${previous.text}${node.text}`;
    else merged.push(node);
  }
  return merged.filter((node) => node.type !== "text" || node.text);
}
