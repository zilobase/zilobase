import http from "node:http";
import https from "node:https";

const MAX_RESPONSE_BYTES = 1024 * 1024;

export function fetchPinnedNodeWebhook(input: {
  body: string;
  headers: Record<string, string>;
  pinnedAddress: string;
  timeoutMs: number;
  url: string;
}) {
  const url = new URL(input.url);
  const client = url.protocol === "https:" ? https : http;
  return new Promise<Response>((resolve, reject) => {
    const connectTimeout = setTimeout(() => request.destroy(new Error("Webhook connection timed out")), 5_000);
    const totalTimeout = setTimeout(() => request.destroy(new Error("Webhook request timed out")), input.timeoutMs);
    const request = client.request({
      headers: { ...input.headers, host: url.host },
      hostname: input.pinnedAddress,
      method: "POST",
      path: `${url.pathname}${url.search}`,
      port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80,
      ...(url.protocol === "https:" ? { servername: url.hostname } : {}),
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          request.destroy(new Error("Webhook response exceeded 1 MiB"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        clearTimeout(totalTimeout);
        resolve(new Response(Buffer.concat(chunks), {
          headers: Object.fromEntries(
            Object.entries(response.headers).flatMap(([name, value]) =>
              value === undefined ? [] : [[name, Array.isArray(value) ? value.join(", ") : value]]
            ),
          ),
          status: response.statusCode ?? 502,
        }));
      });
    });
    request.on("socket", (socket) => {
      socket.once("connect", () => {
        clearTimeout(connectTimeout);
        const remoteAddress = socket.remoteAddress?.replace(/^::ffff:/, "");
        const pinnedAddress = input.pinnedAddress.replace(/^::ffff:/, "");
        if (remoteAddress !== pinnedAddress) request.destroy(new Error("Webhook connection was not pinned"));
      });
    });
    request.on("error", (error) => {
      clearTimeout(connectTimeout);
      clearTimeout(totalTimeout);
      reject(error);
    });
    request.end(input.body);
  });
}
