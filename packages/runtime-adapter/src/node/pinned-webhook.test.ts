import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { test } from "vitest";

import { fetchPinnedNodeWebhook } from "./pinned-webhook";

test("pinned webhooks connect to the resolved address while preserving the HTTP host", async () => {
  let received: { body: string; host: string | undefined; path: string | undefined } | undefined;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received = {
        body: Buffer.concat(chunks).toString(),
        host: request.headers.host,
        path: request.url,
      };
      response.writeHead(202, { "x-webhook": ["accepted", "signed"] });
      response.end("ok");
    });
  });
  await listen(server);
  const address = server.address();
  assert(address && typeof address === "object");

  try {
    const response = await fetchPinnedNodeWebhook({
      body: "payload",
      headers: { "content-type": "text/plain" },
      pinnedAddress: "127.0.0.1",
      timeoutMs: 1_000,
      url: `http://webhook.example:${address.port}/events?source=test`,
    });
    assert.equal(response.status, 202);
    assert.equal(await response.text(), "ok");
    assert.equal(response.headers.get("x-webhook"), "accepted, signed");
    assert.deepEqual(received, {
      body: "payload",
      host: `webhook.example:${address.port}`,
      path: "/events?source=test",
    });
  } finally {
    await close(server);
  }
});

function listen(server: Server) {
  return new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
