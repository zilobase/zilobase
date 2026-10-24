import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { ContentEditorTracker } from "./content-editor";
import { FIELD_NAME } from "./document-codec";
describe("authenticated content editor tracking", () => {
  it("retains the last body editor through comment-only changes and debounce", () => {
    const doc = new Y.Doc();
    doc.getXmlFragment(FIELD_NAME);
    const tracker = new ContentEditorTracker();
    tracker.loaded(doc);
    const paragraph = new Y.XmlElement("paragraph");
    doc.getXmlFragment(FIELD_NAME).insert(0, [paragraph]);
    tracker.changed(doc, "first", new Date(1));
    paragraph.insert(0, [new Y.XmlText("second")]);
    tracker.changed(doc, "second", new Date(2));
    doc.getMap("commentThreads").set("comment", "hello");
    tracker.changed(doc, "commenter", new Date(3));
    expect(tracker.pending(doc)).toEqual({ userId: "second", occurredAt: new Date(2) });
    doc.destroy();
  });
  it("does not attribute initial loading or no-op sync", () => {
    const doc = new Y.Doc();
    const tracker = new ContentEditorTracker();
    tracker.loaded(doc);
    tracker.changed(doc, "viewer");
    expect(tracker.pending(doc)).toBeUndefined();
    doc.destroy();
  });
});
