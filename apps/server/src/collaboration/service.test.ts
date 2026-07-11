import assert from "node:assert/strict";
import test from "node:test";
import {
  createCollaborationTicket,
  documentNameForPage,
  encodePageContentAsYjs,
  materializePageContentFromYjs,
  pageIdFromDocumentName,
  verifyCollaborationTicket,
} from "./service";
import { getCollaborationWebSocketUrl } from "../runtime-adapter";

const env = { BETTER_AUTH_SECRET: "test-collaboration-secret" };

test("collaboration tickets are scoped and reject tampering", async () => {
  const { token } = await createCollaborationTicket(
    { pageId: "page-1", userId: "user-1", workspaceId: "workspace-1" },
    env,
  );

  assert.deepEqual(await verifyCollaborationTicket(token, env), {
    exp: (await verifyCollaborationTicket(token, env)).exp,
    pageId: "page-1",
    userId: "user-1",
    workspaceId: "workspace-1",
  });
  await assert.rejects(
    verifyCollaborationTicket(`${token.slice(0, -1)}x`, env),
    /Invalid collaboration ticket/,
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

test("page document names are deterministic", () => {
  assert.equal(documentNameForPage("abc"), "page:abc");
  assert.equal(pageIdFromDocumentName("page:abc"), "abc");
  assert.equal(pageIdFromDocumentName("database:abc"), null);
});

test("explicit WebSocket URL overrides a rewritten request host", () => {
  assert.equal(
    getCollaborationWebSocketUrl(
      new Request("http://api.notelab.io/pages/page-1/collaboration-ticket"),
      {
        COLLABORATION_WEBSOCKET_URL: "ws://localhost:3000/collaboration",
      },
    ),
    "ws://localhost:3000/collaboration",
  );
});
