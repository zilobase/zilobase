import assert from "node:assert/strict";
import { test } from "vitest";
import * as Y from "yjs";
import {
  assertCommentOnlyCollaborationUpdate,
  appendMeetingTranscriptToDocument,
  createCollaborationTicket,
  documentNameForPage,
  documentNameForMeeting,
  encodePageContentAsYjs,
  isEmptyPageContent,
  isPlaceholderCollaborationState,
  materializePageContentFromYjs,
  pageIdFromDocumentName,
  meetingIdFromDocumentName,
  verifyCollaborationTicket,
} from "./service";
import { getCollaborationWebSocketUrl } from "../infrastructure/runtime/runtime-adapter";

const env = { BETTER_AUTH_SECRET: "test-collaboration-secret" };

test("collaboration tickets are scoped and reject tampering", async () => {
  const { token } = await createCollaborationTicket(
    { pageId: "page-1", scope: "readonly", userId: "user-1", workspaceId: "workspace-1" },
    env,
  );

  assert.deepEqual(await verifyCollaborationTicket(token, env), {
    exp: (await verifyCollaborationTicket(token, env)).exp,
    pageId: "page-1",
    scope: "readonly",
    userId: "user-1",
    workspaceId: "workspace-1",
  });
  await assert.rejects(
    verifyCollaborationTicket(`${token.slice(0, -1)}x`, env),
    /Invalid collaboration ticket/,
  );
});

test("collaboration tickets do not outlive temporary membership access", async () => {
  const maxExpiresAt = new Date(Date.now() + 30_000);
  const ticket = await createCollaborationTicket(
    {
      pageId: "page-1",
      scope: "readonly",
      userId: "user-1",
      workspaceId: "workspace-1",
    },
    env,
    { maxExpiresAt },
  );
  const claims = await verifyCollaborationTicket(ticket.token, env);

  assert.equal(claims.exp, maxExpiresAt.getTime());
  await assert.rejects(
    createCollaborationTicket(
      {
        pageId: "page-1",
        scope: "readonly",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      env,
      { maxExpiresAt: new Date(Date.now() - 1) },
    ),
    /access has expired/,
  );
});

test("canonical page JSON round-trips through Yjs", () => {
  const content = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Realtime" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Hello ", marks: [{ type: "bold" }] },
          { type: "text", text: "team" },
        ],
      },
      {
        type: "databaseBlock",
        attrs: { databaseId: "database-1" },
      },
    ],
  };

  assert.deepEqual(
    materializePageContentFromYjs(encodePageContentAsYjs(content)),
    content,
  );
});

test("materialized page JSON ignores Yjs-native comment metadata", () => {
  const content = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
  };
  const document = new Y.Doc();
  Y.applyUpdate(document, encodePageContentAsYjs(content));
  document.getMap("commentThreads").set("thread-1", { kind: "page" });

  assert.deepEqual(
    materializePageContentFromYjs(Y.encodeStateAsUpdate(document)),
    content,
  );
});

test("comment collaboration updates cannot modify protected page fields", () => {
  const document = new Y.Doc();
  Y.applyUpdate(
    document,
    encodePageContentAsYjs({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
    }),
  );

  const commentClient = new Y.Doc();
  Y.applyUpdate(commentClient, Y.encodeStateAsUpdate(document));
  commentClient.getMap("commentThreads").set("thread-1", { kind: "page" });
  assert.doesNotThrow(() =>
    assertCommentOnlyCollaborationUpdate(
      document,
      Y.encodeStateAsUpdate(commentClient, Y.encodeStateVector(document)),
    ),
  );

  const editingClient = new Y.Doc();
  Y.applyUpdate(editingClient, Y.encodeStateAsUpdate(document));
  const maliciousText = new Y.XmlText();
  maliciousText.insert(0, "Changed");
  editingClient.getXmlFragment("default").insert(0, [maliciousText]);
  assert.throws(
    () =>
      assertCommentOnlyCollaborationUpdate(
        document,
        Y.encodeStateAsUpdate(editingClient, Y.encodeStateVector(document)),
      ),
    /cannot modify page content/,
  );
});

test("empty page content and placeholder collaboration state are detected", () => {
  assert.equal(isEmptyPageContent(null), true);
  assert.equal(isEmptyPageContent({ type: "doc", content: [] }), true);
  assert.equal(
    isEmptyPageContent({
      type: "doc",
      content: [{ type: "paragraph" }],
    }),
    true,
  );
  assert.equal(
    isEmptyPageContent({
      type: "doc",
      content: [
        {
          type: "databaseBlock",
          attrs: { databaseId: "database-1" },
        },
      ],
    }),
    false,
  );
  assert.equal(
    isPlaceholderCollaborationState(Uint8Array.from([0, 0])),
    true,
  );
  assert.equal(
    isPlaceholderCollaborationState(encodePageContentAsYjs(null)),
    true,
  );
  assert.equal(
    isPlaceholderCollaborationState(
      encodePageContentAsYjs({
        type: "doc",
        content: [{ type: "paragraph" }],
      }),
    ),
    true,
  );
  assert.equal(
    isPlaceholderCollaborationState(
      encodePageContentAsYjs({
        type: "doc",
        content: [
          {
            type: "databaseBlock",
            attrs: { databaseId: "database-1" },
          },
        ],
      }),
    ),
    false,
  );
});

test("page document names are deterministic", () => {
  assert.equal(documentNameForPage("abc"), "page:abc");
  assert.equal(pageIdFromDocumentName("page:abc"), "abc");
  assert.equal(pageIdFromDocumentName("database:abc"), null);
  assert.equal(documentNameForMeeting("meeting-1"), "meeting:meeting-1");
  assert.equal(meetingIdFromDocumentName("meeting:meeting-1"), "meeting-1");
  assert.equal(meetingIdFromDocumentName("page:meeting-1"), null);
});

test("meeting collaboration tickets are independently scoped", async () => {
  const ticket = await createCollaborationTicket(
    {
      meetingId: "meeting-1",
      scope: "read-write",
      userId: "user-1",
      workspaceId: "workspace-1",
    },
    env,
  );
  const claims = await verifyCollaborationTicket(ticket.token, env);

  assert.equal("meetingId" in claims ? claims.meetingId : null, "meeting-1");
  assert.equal(claims.scope, "read-write");
});

test("meeting transcript updates append to their own Yjs field exactly once", () => {
  const document = new Y.Doc();
  document.getXmlFragment("notes").push([new Y.XmlElement("paragraph")]);
  document.getXmlFragment("summary").push([new Y.XmlElement("paragraph")]);
  const segment = {
    id: "segment-1",
    source: "microphone" as const,
    startMs: 5_000,
    text: "Hello team",
  };

  assert.equal(appendMeetingTranscriptToDocument(document, segment), true);
  assert.equal(appendMeetingTranscriptToDocument(document, segment), false);
  assert.equal(document.getXmlFragment("notes").length, 1);
  assert.equal(document.getXmlFragment("summary").length, 1);
  assert.equal(document.getXmlFragment("transcript").length, 1);
  assert.equal(
    document.getXmlFragment("transcript").toString(),
    "<paragraph>[0:05] You: Hello team</paragraph>",
  );
  assert.equal(document.getMap("transcriptSegmentIds").size, 1);
});

test("meeting transcript paragraphs stay ordered when providers finish out of order", () => {
  const document = new Y.Doc();

  for (const segment of [
    { id: "segment-10", source: "microphone" as const, startMs: 10_000, text: "Last" },
    { id: "segment-2", source: "system" as const, startMs: 2_000, text: "First" },
    { id: "segment-6", source: "microphone" as const, startMs: 6_000, text: "Middle" },
  ]) {
    assert.equal(appendMeetingTranscriptToDocument(document, segment), true);
  }

  assert.equal(
    document.getXmlFragment("transcript").toString(),
    "<paragraph>[0:02] Others: First</paragraph>" +
      "<paragraph>[0:06] You: Middle</paragraph>" +
      "<paragraph>[0:10] You: Last</paragraph>",
  );
  assert.equal(
    appendMeetingTranscriptToDocument(document, {
      id: "segment-6",
      source: "microphone",
      startMs: 6_000,
      text: "Middle",
    }),
    false,
  );
});

test("a finalized transcript clears only its matching live Yjs draft", () => {
  const document = new Y.Doc();
  appendMeetingTranscriptToDocument(document, {
    id: "segment-1",
    source: "microphone",
    startMs: 0,
    text: "Finished",
  });

  const microphoneDraft = document.getMap<string | number>(
    "liveTranscript:microphone",
  );
  microphoneDraft.set("itemId", "item-2");
  microphoneDraft.set("startMs", 5_000);
  microphoneDraft.set("text", "Still speaking");
  microphoneDraft.set("updatedAt", 123);
  const systemDraft = document.getMap<string | number>(
    "liveTranscript:system",
  );
  systemDraft.set("itemId", "item-2");
  systemDraft.set("text", "Overlapping speech");
  assert.deepEqual(microphoneDraft.toJSON(), {
    itemId: "item-2",
    startMs: 5_000,
    text: "Still speaking",
    updatedAt: 123,
  });
  assert.equal(
    document.getXmlFragment("transcript").toString(),
    "<paragraph>[0:00] You: Finished</paragraph>",
  );

  assert.equal(appendMeetingTranscriptToDocument(document, {
    id: "segment-2",
    source: "microphone",
    startMs: 5_000,
    text: "Still speaking",
  }, "item-2"), true);
  assert.equal(microphoneDraft.size, 0);
  assert.equal(systemDraft.size, 2);

  microphoneDraft.set("itemId", "item-3");
  microphoneDraft.set("startMs", 10_000);
  microphoneDraft.set("text", "Another turn");
  microphoneDraft.set("updatedAt", 456);
  appendMeetingTranscriptToDocument(document, {
    id: "segment-3",
    source: "microphone",
    startMs: 10_000,
    text: "Different final",
  }, "different-item");
  assert.equal(microphoneDraft.size, 4);
});

test("explicit WebSocket URL overrides a rewritten request host", () => {
  assert.equal(
    getCollaborationWebSocketUrl(
      new Request("http://api.zilobase.com/pages/page-1/collaboration-ticket"),
      {
        COLLABORATION_WEBSOCKET_URL: "ws://localhost:3000/collaboration",
      },
    ),
    "ws://localhost:3000/collaboration",
  );
});

test("two Yjs documents converge after concurrent map edits", () => {
  const first = new Y.Doc();
  const second = new Y.Doc();

  first.on("update", (update: Uint8Array) => Y.applyUpdate(second, update));
  second.on("update", (update: Uint8Array) => Y.applyUpdate(first, update));

  first.getMap("fields").set("fromFirst", "alpha");
  second.getMap("fields").set("fromSecond", "beta");

  assert.equal(first.getMap("fields").get("fromSecond"), "beta");
  assert.equal(second.getMap("fields").get("fromFirst"), "alpha");
});

test("two Hocuspocus clients sync Yjs updates through the server", async () => {
  const { HocuspocusProvider } = await import("@hocuspocus/provider");
  const { Server } = await import("@hocuspocus/server");

  const server = new Server({
    address: "127.0.0.1",
    debounce: 0,
    port: 0,
    quiet: true,
    stopOnSignals: false,
    async onAuthenticate() {
      return { user: "test" };
    },
  });

  await server.listen();
  const url = `ws://127.0.0.1:${server.address.port}`;
  const firstDocument = new Y.Doc();
  const secondDocument = new Y.Doc();
  const first = new HocuspocusProvider({
    document: firstDocument,
    name: "page:sync-test",
    token: "first",
    url,
  });
  const second = new HocuspocusProvider({
    document: secondDocument,
    name: "page:sync-test",
    token: "second",
    url,
  });

  try {
    await Promise.all([waitForProviderSync(first), waitForProviderSync(second)]);

    firstDocument.getMap("fields").set("title", "hello");
    await waitUntil(() => secondDocument.getMap("fields").get("title") === "hello");

    secondDocument.getMap("fields").set("title", "world");
    await waitUntil(() => firstDocument.getMap("fields").get("title") === "world");

    firstDocument.getMap("fields").set("fromFirst", 1);
    secondDocument.getMap("fields").set("fromSecond", 2);
    await waitUntil(
      () =>
        firstDocument.getMap("fields").get("fromSecond") === 2 &&
        secondDocument.getMap("fields").get("fromFirst") === 1,
    );
  } finally {
    first.destroy();
    second.destroy();
    await Promise.race([
      server.destroy(),
      new Promise((resolve) => setTimeout(resolve, 1_000)),
    ]);
  }
});

function waitForProviderSync(provider: {
  isSynced: boolean;
  on(event: "synced", listener: (data: { state: boolean }) => void): void;
  off(event: "synced", listener: (data: { state: boolean }) => void): void;
}) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for Hocuspocus sync")),
      5_000,
    );
    const onSynced = ({ state }: { state: boolean }) => {
      if (!state) return;
      clearTimeout(timeout);
      provider.off("synced", onSynced);
      resolve();
    };
    provider.on("synced", onSynced);
    if (provider.isSynced) onSynced({ state: true });
  });
}

function waitUntil(predicate: () => boolean, timeoutMs = 5_000) {
  return new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error("Timed out waiting for Yjs documents to converge"));
        return;
      }
      setTimeout(check, 20);
    };
    check();
  });
}
