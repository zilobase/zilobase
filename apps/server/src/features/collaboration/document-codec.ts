import { ProsemirrorTransformer } from "@hocuspocus/transformer";
import { Schema, type MarkSpec, type NodeSpec } from "@tiptap/pm/model";
import * as Y from "yjs";

export const FIELD_NAME = "default";

export function encodePageContentAsYjs(content: unknown) {
  return Y.encodeStateAsUpdate(toYDoc(content));
}

export function materializePageContentFromYjs(state: Uint8Array) {
  const document = new Y.Doc();
  Y.applyUpdate(document, state);
  return materializePageDocument(document);
}

function toYDoc(content: unknown) {
  const normalized = normalizeDocument(content);
  return ProsemirrorTransformer.toYdoc(normalized, FIELD_NAME, createSchemaForDocument(normalized));
}

export function encodeContentAsYjs(content: unknown, field: string) {
  const normalized = normalizeDocument(content);
  return Y.encodeStateAsUpdate(
    ProsemirrorTransformer.toYdoc(normalized, field, createSchemaForDocument(normalized)),
  );
}

function normalizeDocument(content: unknown): ProseMirrorJson {
  return content &&
    typeof content === "object" &&
    !Array.isArray(content) &&
    typeof (content as { type?: unknown }).type === "string"
    ? (content as ProseMirrorJson)
    : { type: "doc", content: [] };
}

type ProseMirrorJson = {
  attrs?: Record<string, unknown>;
  content?: ProseMirrorJson[];
  marks?: Array<{ attrs?: Record<string, unknown>; type: string }>;
  text?: string;
  type: string;
};

function createSchemaForDocument(document: ProseMirrorJson) {
  const nodeAttrs = new Map<string, Set<string>>();
  const markAttrs = new Map<string, Set<string>>();

  visit(document, (node) => {
    const attrs = nodeAttrs.get(node.type) ?? new Set<string>();
    Object.keys(node.attrs ?? {}).forEach((key) => attrs.add(key));
    nodeAttrs.set(node.type, attrs);
    for (const mark of node.marks ?? []) {
      const current = markAttrs.get(mark.type) ?? new Set<string>();
      Object.keys(mark.attrs ?? {}).forEach((key) => current.add(key));
      markAttrs.set(mark.type, current);
    }
  });

  nodeAttrs.set("doc", nodeAttrs.get("doc") ?? new Set());
  nodeAttrs.set("paragraph", nodeAttrs.get("paragraph") ?? new Set());
  nodeAttrs.set("text", new Set());

  const nodes: Record<string, NodeSpec> = {};
  for (const [name, attrs] of nodeAttrs) {
    nodes[name] = nodeSpec(name, attrs);
  }
  const marks: Record<string, MarkSpec> = {};
  for (const [name, attrs] of markAttrs) {
    marks[name] = { attrs: attrsSpec(attrs) };
  }
  return new Schema({ nodes, marks });
}

function nodeSpec(name: string, attrs: Set<string>): NodeSpec {
  if (name === "doc") return { content: "block*" };
  if (name === "text") return { group: "inline" };
  if (["paragraph", "heading", "codeBlock", "detailsSummary"].includes(name)) {
    return { attrs: attrsSpec(attrs), content: "inline*", group: "block" };
  }
  if (["bulletList", "orderedList", "taskList"].includes(name)) {
    return { attrs: attrsSpec(attrs), content: "block*", group: "block" };
  }
  if (
    [
      "listItem",
      "taskItem",
      "blockquote",
      "details",
      "detailsContent",
      "column",
      "columns",
      "tableCell",
      "tableHeader",
    ].includes(name)
  ) {
    return { attrs: attrsSpec(attrs), content: "block*", group: "block" };
  }
  if (name === "table") {
    return { attrs: attrsSpec(attrs), content: "tableRow+", group: "block" };
  }
  if (name === "tableRow") {
    return { attrs: attrsSpec(attrs), content: "(tableCell | tableHeader)+" };
  }
  if (["hardBreak", "emoji", "linkMention"].includes(name)) {
    return {
      attrs: attrsSpec(attrs),
      group: "inline",
      inline: true,
      atom: true,
    };
  }
  return { attrs: attrsSpec(attrs), group: "block", atom: true };
}

function attrsSpec(attrs: Set<string>) {
  return Object.fromEntries([...attrs].map((name) => [name, { default: null }]));
}

function visit(node: ProseMirrorJson, callback: (node: ProseMirrorJson) => void) {
  callback(node);
  node.content?.forEach((child) => visit(child, callback));
}

function compactMaterializedJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(compactMaterializedJson);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const compacted = Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) => {
      if (
        key === "attrs" &&
        child &&
        typeof child === "object" &&
        !Array.isArray(child) &&
        Object.keys(child).length === 0
      ) {
        return [];
      }

      return [[key, compactMaterializedJson(child)]];
    }),
  );

  return compacted;
}
export function materializePageDocument(document: Y.Doc) {
  return compactMaterializedJson(ProsemirrorTransformer.fromYdoc(document, FIELD_NAME));
}
