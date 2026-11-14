import { chatReferences, chatMarkers } from "./references";
import type { ContextManifestEntry, ResourceRef } from "@zilobase/page-context";

export type ChatMentionPart =
  | { type: "text"; text: string }
  | { type: "source"; source: ResourceRef };

/** User references are self-contained; roots retain compatibility with older saved messages. */
export function chatMentionParts(text: string, roots: ResourceRef[] = []): ChatMentionPart[] {
  const parts: ChatMentionPart[] = [];
  const used = new Set<string>();
  let position = 0;
  for (const { from, to, source } of chatReferences(text)) {
    if (from > position) parts.push({ type: "text", text: text.slice(position, from) });
    parts.push({ type: "source", source });
    used.add(`${source.type}:${source.id}`);
    position = to;
  }
  if (position < text.length) parts.push({ type: "text", text: text.slice(position) });
  for (const [key, source] of new Map(
    roots.map((source) => [`${source.type}:${source.id}`, source]),
  )) {
    if (used.has(key)) continue;
    parts.push({ type: "text", text: " " }, { type: "source", source });
  }
  return parts;
}

/** Hide only an unfinished streaming reference; complete references remain available for inline rendering. */
function withoutPendingMarker(text: string) {
  const pending = text.match(/\[\[([^\]\n]*)(?:\])?$/);
  if (!pending) return text;
  const value = pending[1]!;
  const prefixes = ["page:", "database:", "source:", "record:"];
  // Code examples are literal, including an unfinished marker inside a code span/fence.
  if (!prefixes.some((prefix) => prefix.startsWith(value) || value.startsWith(prefix))) return text;
  const probe = text.slice(0, pending.index) + "[[page:streaming-probe]]";
  return chatMarkers(probe).some((marker) => marker.from === pending.index)
    ? text.slice(0, pending.index).trimEnd()
    : text;
}

export type ChatCitationPart =
  | { type: "text"; text: string }
  /** `blockId` comes from `[[page:ID#BLOCK_ID]]`, citing one block of a read page. */
  | { type: "citation"; entry: ContextManifestEntry; blockId?: string };

export function chatCitationParts(
  text: string,
  manifest: ContextManifestEntry[],
): ChatCitationPart[] {
  const content = withoutPendingMarker(text);
  const entries = new Map(manifest.map((entry) => [entry.key, entry]));
  const parts: ChatCitationPart[] = [];
  let position = 0;
  for (const marker of chatMarkers(content)) {
    const [markerId, blockId] =
      marker.type === "page" && marker.id.includes("#")
        ? (marker.id.split("#", 2) as [string, string])
        : [marker.id, undefined];
    let key = `${marker.type}:${markerId}`;
    if (!entries.has(key)) {
      try {
        key = `${marker.type}:${decodeURIComponent(markerId)}`;
      } catch {
        /* Invalid markers cannot cite evidence. */
      }
    }
    const entry = entries.get(key);
    const preceding = content.slice(position, marker.from);
    if (preceding)
      parts.push({ type: "text", text: entry ? preceding : preceding.replace(/[ \t]+$/, "") });
    if (entry)
      parts.push(blockId ? { type: "citation", entry, blockId } : { type: "citation", entry });
    position = marker.to;
  }
  if (position < content.length) parts.push({ type: "text", text: content.slice(position) });
  return parts;
}

export function chatDisplayText(text: string) {
  return chatCitationParts(text, [])
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trimEnd();
}

export function chatCitations(text: string, manifest: ContextManifestEntry[]) {
  const used = new Set<string>();
  return chatCitationParts(text, manifest).flatMap((part) => {
    if (part.type !== "citation" || used.has(part.entry.key)) return [];
    used.add(part.entry.key);
    return [part.entry];
  });
}
