import { markdownToPageDocument, prosemirrorToMarkdown } from "@zilobase/page-context";
import { expect, test } from "vitest";
import * as Y from "yjs";
import {
  encodePageContentAsYjs,
  FIELD_NAME,
  materializePageDocument,
} from "../documents/document-codec";
import { COMMENT_THREADS_FIELD } from "../persistence/document-persistence";
import { editPageContentInHocuspocus, readPageContentInHocuspocus } from "./document-mutations";

function livePage(markdown: string) {
  const document = new Y.Doc();
  Y.applyUpdate(document, encodePageContentAsYjs(markdownToPageDocument(markdown)));
  const hocuspocus = {
    openDirectConnection: async () => ({
      document,
      transact: async (change: (document: Y.Doc) => void) =>
        document.transact(() => change(document)),
      disconnect: async () => undefined,
    }),
  } as never;
  return { document, hocuspocus };
}
const markdownOf = (document: Y.Doc) => prosemirrorToMarkdown(materializePageDocument(document));

test("edits splice only the targeted blocks of the live page and replay as no-ops", async () => {
  const { document, hocuspocus } = livePage(
    "# Plan\n\nIntro\n\n## Risks\n\nScope creep\n\n## Notes\n\nDone",
  );
  document.getMap(COMMENT_THREADS_FIELD).set("thread-1", new Y.Map());
  const untouched = document.getXmlFragment(FIELD_NAME).get(1);
  const input = {
    pageId: "page-1",
    userId: "user-1",
    editId: "edit-1",
    edits: [
      { type: "replace_section" as const, heading: "Risks", markdown: "- Vendor delay\n- Hiring" },
      { type: "append" as const, markdown: "## Owners\n\nAna" },
    ],
  };
  const original = markdownOf(document);
  const applied = await editPageContentInHocuspocus(hocuspocus, input);
  expect(applied).toMatchObject({ status: "applied", blocks: 8 });
  expect(markdownOf(document)).toBe(
    "# Plan\n\nIntro\n\n## Risks\n\n- Vendor delay\n- Hiring\n\n## Notes\n\nDone\n\n## Owners\n\nAna",
  );
  // The intro paragraph is the same Yjs element, so collaborators' cursors and history survive.
  expect(document.getXmlFragment(FIELD_NAME).get(1)).toBe(untouched);
  expect(document.getMap(COMMENT_THREADS_FIELD).has("thread-1")).toBe(true);
  expect(await editPageContentInHocuspocus(hocuspocus, input)).toEqual({
    status: "replayed",
    blocks: 8,
  });
  expect(markdownOf(document).match(/## Owners/g)).toHaveLength(1);
  const blocks = (
    materializePageDocument(document) as { content: Array<{ attrs?: { blockId?: string } }> }
  ).content;
  expect(blocks.slice(-2).every((block) => typeof block.attrs?.blockId === "string")).toBe(true);
  // Applying the recorded inverse restores the page, for undo.
  const undo = await editPageContentInHocuspocus(hocuspocus, {
    ...input,
    editId: "undo-1",
    edits: (applied as unknown as { inverse: never[] }).inverse,
  });
  expect(undo).toMatchObject({ status: "applied" });
  expect(markdownOf(document)).toBe(original);
  expect(document.getXmlFragment(FIELD_NAME).get(1)).toBe(untouched);
});

test("edits that cannot be resolved leave the page unchanged", async () => {
  const { document, hocuspocus } = livePage("# Plan\n\nIntro");
  const before = markdownOf(document);
  expect(
    await editPageContentInHocuspocus(hocuspocus, {
      pageId: "page-1",
      userId: "user-1",
      editId: "edit-2",
      edits: [{ type: "insert_after", anchor: "Missing", markdown: "x" }],
    }),
  ).toMatchObject({ status: "rejected" });
  expect(markdownOf(document)).toBe(before);
});

test("live reads return the collaboration document, including edits not yet saved", async () => {
  const { document, hocuspocus } = livePage("# Plan\n\nIntro");
  await editPageContentInHocuspocus(hocuspocus, {
    pageId: "page-1",
    userId: "user-1",
    editId: "edit-3",
    edits: [{ type: "append", markdown: "Typed just now" }],
  });
  const live = await readPageContentInHocuspocus(hocuspocus, {
    pageId: "page-1",
    userId: "user-1",
  });
  expect(prosemirrorToMarkdown(live)).toBe("# Plan\n\nIntro\n\nTyped just now");
  expect(markdownOf(document)).toBe(prosemirrorToMarkdown(live));
});
