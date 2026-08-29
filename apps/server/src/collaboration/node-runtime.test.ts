import assert from "node:assert/strict";
import { createConnection } from "node:net";
import { createServer, type Server } from "node:http";
import { test } from "vitest";
import {
  attachNodeCollaborationRuntime,
  NODE_COLLABORATION_MAX_PAYLOAD_BYTES,
} from "./node-runtime";
import { COLLABORATION_WEBSOCKET_PROTOCOL } from "../shared/security/auth-headers";

test("serverful collaboration rejects unauthenticated upgrades", async () => {
  const fixture = await startFixture(async () => null);

  try {
    assert.equal(await requestUpgradeStatus(fixture.url), 401);
  } finally {
    await fixture.close();
  }
});

test("serverful collaboration rate limits before accepting another socket", async () => {
  const fixture = await startFixture(async () => "user-1", 1);
  const first = await openWebSocket(fixture.url);

  try {
    assert.equal(await requestUpgradeStatus(fixture.url), 429);
  } finally {
    first.close();
    await fixture.close();
  }
});

test("serverful collaboration negotiates the desktop subprotocol", async () => {
  const fixture = await startFixture(async () => "user-1");
  const websocket = await openWebSocket(fixture.url, [
    COLLABORATION_WEBSOCKET_PROTOCOL,
    "zilobase.session.v1.dGVzdA",
  ]);

  try {
    assert.equal(websocket.protocol, COLLABORATION_WEBSOCKET_PROTOCOL);
  } finally {
    websocket.close();
    await fixture.close();
  }
});

test("serverful collaboration accepts the meeting collaboration path", async () => {
  const fixture = await startFixture(async () => "user-1", 60, "/meeting-collaboration");
  const websocket = await openWebSocket(fixture.url);

  try {
    assert.equal(websocket.readyState, WebSocket.OPEN);
  } finally {
    websocket.close();
    await fixture.close();
  }
});

test("serverful collaboration closes oversized messages with code 1009", async () => {
  const fixture = await startFixture(async () => "user-1");
  const websocket = await openWebSocket(fixture.url);

  try {
    const closed = waitForClose(websocket);
    websocket.send(new Uint8Array(NODE_COLLABORATION_MAX_PAYLOAD_BYTES + 1));
    const event = await closed;
    assert.equal(event.code, 1009);
  } finally {
    websocket.close();
    await fixture.close();
  }
});

async function startFixture(
  authenticate: () => Promise<string | null>,
  connectionLimit = 60,
  pathname = "/collaboration",
) {
  const server = createServer((_request, response) => response.end());
  const collaboration = attachNodeCollaborationRuntime(
    server,
    {},
    { authenticate, connectionLimit },
  );

  await listen(server);
  const address = server.address();
  assert(address && typeof address === "object");

  return {
    async close() {
      await collaboration.destroy();
      await closeServer(server);
    },
    url: `ws://127.0.0.1:${address.port}${pathname}?document=page%3Atest`,
  };
}

function listen(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function openWebSocket(url: string, protocols?: string[]) {
  return new Promise<WebSocket>((resolve, reject) => {
    const websocket = new WebSocket(url, protocols);
    websocket.binaryType = "arraybuffer";
    websocket.addEventListener("open", () => resolve(websocket), { once: true });
    websocket.addEventListener("error", () => {
      reject(new Error("WebSocket upgrade failed"));
    }, { once: true });
  });
}

function requestUpgradeStatus(value: string) {
  const url = new URL(value);

  return new Promise<number>((resolve, reject) => {
    const socket = createConnection(Number(url.port), url.hostname);
    let response = "";

    socket.setEncoding("utf8");
    socket.once("error", reject);
    socket.on("data", (chunk) => {
      response += chunk;
    });
    socket.once("end", () => {
      const status = Number(response.match(/^HTTP\/1\.1 (\d{3})/)?.[1]);

      if (!Number.isInteger(status)) {
        reject(new Error(`Invalid upgrade response: ${response}`));
        return;
      }

      resolve(status);
    });
    socket.once("connect", () => {
      socket.write([
        `GET ${url.pathname}${url.search} HTTP/1.1`,
        `Host: ${url.host}`,
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        "Sec-WebSocket-Version: 13",
        "",
        "",
      ].join("\r\n"));
    });
  });
}

function waitForClose(websocket: WebSocket) {
  return new Promise<CloseEvent>((resolve) => {
    websocket.addEventListener("close", resolve, { once: true });
  });
}
