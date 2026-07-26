import assert from "node:assert/strict";
import test from "node:test";
import type { ConnectedAccount } from "@zilobase/toolkit";

import {
  buildToolkitTools,
  createToolkit,
  getToolkitUserId,
  selectToolkitConnectors,
} from "./toolkit";

test("Toolkit uses the configured local API URL", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl: string | undefined;
  globalThis.fetch = async (input) => {
    requestUrl = String(input);
    return Response.json({ items: [] });
  };

  try {
    const toolkit = createToolkit({
      TOOLKIT_API_KEY: "nlc_test_local-base-url",
      TOOLKIT_BASE_URL: "http://localhost:3100///",
    });

    await toolkit.connectors.list();
    assert.equal(requestUrl, "http://localhost:3100/v1/connectors");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Toolkit user ids are scoped to both workspace and user", () => {
  assert.notEqual(
    getToolkitUserId("workspace-a", "user-1"),
    getToolkitUserId("workspace-b", "user-1"),
  );
  assert.equal(
    getToolkitUserId("workspace-a", "user-1"),
    "zilobase:workspace-a:user-1",
  );
});

test("Toolkit chat selects only active connected sources", () => {
  const accounts = [
    account("gmail", "active"),
    account("github", "expired"),
    account("google-drive", "active"),
  ];

  assert.deepEqual(selectToolkitConnectors(accounts, []), [
    "gmail",
    "google-drive",
  ]);
  assert.deepEqual(
    selectToolkitConnectors(accounts, ["github", "gmail", "gmail"]),
    ["gmail"],
  );
});

test("Toolkit chat accepts current tool descriptors without intent phrases", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const pathname = new URL(String(input)).pathname;

    if (pathname === "/v1/connected-accounts") {
      return Response.json({ items: [account("gmail", "active")] });
    }

    if (pathname === "/v1/tools/query") {
      return Response.json({
        items: [
          {
            access: "read",
            connectorId: "gmail",
            description: "List Gmail messages.",
            id: "gmail.messages.list",
            inputSchema: { properties: {}, type: "object" },
            name: "listMessages",
            presentation: {
              progressPhrases: ["Listing Gmail messages"],
              title: "List Gmail messages",
            },
            requiredScopes: [],
          },
        ],
      });
    }

    throw new Error(`Unexpected Toolkit request: ${pathname}`);
  };

  try {
    const tools = await buildToolkitTools({
      env: {
        TOOLKIT_API_KEY: "nlc_test_current-descriptor",
        TOOLKIT_BASE_URL: "http://localhost:3100",
      },
      sources: ["gmail"],
      userId: "user-1",
      workspaceId: "workspace-a",
    });

    assert.deepEqual(Object.keys(tools), ["gmail_messages_list"]);
    assert.equal(
      tools.gmail_messages_list?.description,
      "List Gmail messages.",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function account(
  connectorId: string,
  status: ConnectedAccount["status"],
): ConnectedAccount {
  return {
    connectorId,
    createdAt: new Date(0).toISOString(),
    id: crypto.randomUUID(),
    isDefault: true,
    status,
    updatedAt: new Date(0).toISOString(),
    userId: "user-1",
  };
}
