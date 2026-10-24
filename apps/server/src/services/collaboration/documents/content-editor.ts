import type * as Y from "yjs";
import { materializePageDocument } from "./document-codec";

export type ContentEdit = { userId: string | null; occurredAt: Date };
/** Server-owned state: never trust a client-supplied Yjs author field. */
export class ContentEditorTracker {
  private readonly states = new WeakMap<Y.Doc, { body: string; edit?: ContentEdit }>();
  loaded(document: Y.Doc) {
    this.states.set(document, { body: JSON.stringify(materializePageDocument(document)) });
  }
  changed(document: Y.Doc, userId?: string, now = new Date()) {
    const body = JSON.stringify(materializePageDocument(document));
    const previous = this.states.get(document);
    if (previous && body !== previous.body)
      this.states.set(document, { body, edit: { userId: userId ?? null, occurredAt: now } });
    else if (!previous) this.states.set(document, { body });
  }
  pending(document: Y.Doc) {
    return this.states.get(document)?.edit;
  }
}
