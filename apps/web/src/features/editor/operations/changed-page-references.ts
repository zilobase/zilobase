import type { Transaction } from "@tiptap/pm/state";
import type { Node } from "@tiptap/pm/model";

/** Inspect changed structural ranges without serializing the document on typing. */
export function changedPageReferences(transaction: Transaction) {
  const removed = new Set<string>();
  const added = new Set<string>();
  const collect = (doc: Node, from: number, to: number, ids: Set<string>) => {
    if (from === to) return;
    doc.nodesBetween(from, Math.min(to, doc.content.size), (node) => {
      if (node.type.name === "pageBlock" && typeof node.attrs.pageId === "string")
        ids.add(node.attrs.pageId);
    });
  };
  transaction.mapping.maps.forEach((map, index) => {
    const before = transaction.docs[index];
    const after = transaction.docs[index + 1] ?? transaction.doc;
    map.forEach((from, to, nextFrom, nextTo) => {
      collect(before, from, to, removed);
      collect(after, nextFrom, nextTo, added);
    });
  });
  // A move, undo or later step may retain the same resource elsewhere in the document.
  if (removed.size)
    transaction.doc.descendants((node) => {
      if (node.type.name === "pageBlock") removed.delete(node.attrs.pageId);
      return removed.size > 0;
    });
  return { removed, added };
}
