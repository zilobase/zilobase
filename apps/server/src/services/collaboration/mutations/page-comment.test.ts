import { expect, test } from "vitest";
import * as Y from "yjs";
import { COMMENT_THREADS_FIELD } from "../persistence/document-persistence";
import { appendPageCommentInHocuspocus } from "./document-mutations";

function fakeHocuspocus(document: Y.Doc) {
  return {
    openDirectConnection: async () => ({
      transact: async (change: (document: Y.Doc) => void) =>
        document.transact(() => change(document)),
      disconnect: async () => undefined,
    }),
  } as never;
}

const author = { email: "a@zilobase.local", id: "user-1", image: null, name: "Ana" };

test("comments with reserved IDs are appended once across redeliveries", async () => {
  const document = new Y.Doc();
  const hocuspocus = fakeHocuspocus(document);
  const input = { author, body: "Looks good", pageId: "page-1", threadId: "t-1", messageId: "m-1" };
  expect(await appendPageCommentInHocuspocus(hocuspocus, input)).toEqual({
    threadId: "t-1",
    messageId: "m-1",
  });
  await appendPageCommentInHocuspocus(hocuspocus, input);
  const threads = document.getMap<Y.Map<unknown>>(COMMENT_THREADS_FIELD);
  expect([...threads.keys()]).toEqual(["t-1"]);
  const messages = threads.get("t-1")!.get("messages") as Y.Map<Y.Map<unknown>>;
  expect(messages.get("m-1")!.get("body")).toBe("Looks good");
});

test("comments without reserved IDs still create a new thread each time", async () => {
  const document = new Y.Doc();
  const hocuspocus = fakeHocuspocus(document);
  await appendPageCommentInHocuspocus(hocuspocus, { author, body: "One", pageId: "page-1" });
  await appendPageCommentInHocuspocus(hocuspocus, { author, body: "Two", pageId: "page-1" });
  expect(document.getMap(COMMENT_THREADS_FIELD).size).toBe(2);
});
