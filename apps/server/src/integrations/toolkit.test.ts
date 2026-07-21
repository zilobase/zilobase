import assert from "node:assert/strict";
import test from "node:test";
import type { ConnectedAccount } from "@zilobase/toolkit";

import {
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
