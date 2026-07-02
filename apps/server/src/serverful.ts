import { createServer, type IncomingMessage } from "node:http";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { config as loadEnv } from "dotenv";
import { Readable } from "node:stream";
import { createApp } from "./app";

loadEnv({ path: fileURLToPath(new NodeURL("../.env", import.meta.url)) });

const app = createApp();
const port = readPort(process.env.PORT) ?? 3000;
const hostname = process.env.HOST ?? "0.0.0.0";

createServer(async (incoming, outgoing) => {
  try {
    const request = toRequest(incoming);
    const response = await app.fetch(request, process.env as Record<string, unknown>);

    outgoing.statusCode = response.status;
    response.headers.forEach((value, key) => {
      outgoing.setHeader(key, value);
    });

    if (!response.body) {
      outgoing.end();
      return;
    }

    Readable.fromWeb(response.body as never).pipe(outgoing);
  } catch (error) {
    console.error("Unhandled server error", error);

    if (!outgoing.headersSent) {
      outgoing.statusCode = 500;
      outgoing.setHeader("content-type", "application/json");
    }

    outgoing.end(JSON.stringify({ error: "Internal server error" }));
  }
}).listen(port, hostname, () => {
  console.log(`Notelab server listening on http://${hostname}:${port}`);
});

function toRequest(incoming: IncomingMessage) {
  const host = incoming.headers.host ?? `localhost:${port}`;
  const forwardedProtocol = incoming.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProtocol)
    ? forwardedProtocol[0]
    : forwardedProtocol ?? "http";
  const url = new URL(incoming.url ?? "/", `${protocol}://${host}`);
  const headers = new Headers();

  for (const [key, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }

    if (value !== undefined) {
      headers.set(key, value);
    }
  }

  return new Request(url, {
    body: hasRequestBody(incoming.method)
      ? Readable.toWeb(incoming) as never
      : undefined,
    duplex: "half",
    headers,
    method: incoming.method,
  } as RequestInit & { duplex: "half" });
}

function hasRequestBody(method: string | undefined) {
  return method !== "GET" && method !== "HEAD";
}

function readPort(value: string | undefined) {
  if (!value) {
    return null;
  }

  const numberValue = Number(value);

  return Number.isSafeInteger(numberValue) && numberValue > 0
    ? numberValue
    : null;
}
