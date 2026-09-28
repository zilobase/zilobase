import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import type { ApiFetcher } from "../../shared/api-fetcher";
import { databaseController, retainDatabaseController } from "./store";

test("provider cleanup survives StrictMode reattachment and releases only its session on unmount", async () => {
  const client = new QueryClient();
  const fetch = (() => Promise.reject(new Error("unused"))) as ApiFetcher;
  const controller = databaseController(client, "session", fetch);
  const first = retainDatabaseController(client, "session", fetch);
  client.setQueryData(["db", "session", "host"], {});
  client.setQueryData(["db", "other", "host"], {});
  first();
  const second = retainDatabaseController(client, "session", fetch);
  await Promise.resolve();
  assert.equal(databaseController(client, "session", fetch), controller);
  second();
  await Promise.resolve();
  assert.equal(client.getQueryData(["db", "session", "host"]), undefined);
  assert.ok(client.getQueryData(["db", "other", "host"]));
  await assert.rejects(
    controller.execute({
      databaseId: "host",
      command: { type: "database.update", patch: { name: "No" } },
    }),
    /session ended/,
  );
  client.clear();
});
