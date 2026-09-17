import { lookup } from "node:dns/promises";
import https from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import { isIP } from "node:net";
import { Readable } from "node:stream";

import { isBlockedAddress } from "../../features/automations/actions/webhook-egress";

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

type AddressResolver = (hostname: string) => Promise<string[]>;

export async function fetchPinnedNodeMcp(input: {
  body: string | null;
  headers: Record<string, string>;
  method: string;
  signal?: AbortSignal;
  timeoutMs: number;
  url: string;
}) {
  const timeoutSignal = AbortSignal.timeout(input.timeoutMs);
  const signal = input.signal
    ? AbortSignal.any([input.signal, timeoutSignal])
    : timeoutSignal;
  const url = new URL(input.url);
  if (url.protocol !== "https:")
    throw new Error("MCP endpoints must use HTTPS");
  const pinnedAddress = await abortable(
    resolvePublicNodeMcpAddress(url.hostname),
    signal,
  );

  return new Promise<Response>((resolve, reject) => {
    const request = https.request(
      buildPinnedMcpRequestOptions(input, pinnedAddress),
    );
    const connectTimeout = setTimeout(
      () => request.destroy(new Error("MCP connection timed out")),
      Math.min(5_000, input.timeoutMs),
    );
    const abort = () => request.destroy(abortReason(signal));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    request.on("socket", (socket) => {
      socket.once("connect", () => {
        clearTimeout(connectTimeout);
        if (
          !socket.remoteAddress ||
          !isPinnedMcpRemoteAddress(socket.remoteAddress, pinnedAddress)
        ) {
          request.destroy(new Error("MCP connection was not pinned"));
        }
      });
    });
    request.on("response", (response) => {
      const declared = Number(response.headers["content-length"] ?? 0);
      if (declared > MAX_RESPONSE_BYTES) {
        response.destroy();
        request.destroy(new Error("MCP response exceeded 5 MiB"));
        return;
      }
      let size = 0;
      const bounded = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          size += chunk.byteLength;
          if (size > MAX_RESPONSE_BYTES) {
            request.destroy(new Error("MCP response exceeded 5 MiB"));
            controller.error(new Error("MCP response exceeded 5 MiB"));
            return;
          }
          controller.enqueue(chunk);
        },
      });
      const body = (
        Readable.toWeb(response) as ReadableStream<Uint8Array>
      ).pipeThrough(bounded);
      const headers = webHeaders(response.headers);
      response.once("close", cleanup);
      response.once("end", cleanup);
      const status = response.statusCode ?? 502;
      const responseBody =
        input.method === "HEAD" ||
        status === 204 ||
        status === 205 ||
        status === 304
          ? null
          : body;
      if (!responseBody) response.resume();
      resolve(
        new Response(responseBody, {
          headers,
          status,
          statusText: response.statusMessage,
        }),
      );
    });
    request.on("error", (error) => {
      cleanup();
      reject(error);
    });
    function cleanup() {
      clearTimeout(connectTimeout);
      signal.removeEventListener("abort", abort);
    }
    request.end(input.body ?? undefined);
  });
}

function webHeaders(source: IncomingHttpHeaders) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(source)) {
    if (value !== undefined)
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

export async function resolvePublicNodeMcpAddress(
  rawHostname: string,
  resolver: AddressResolver = resolveSystemAddresses,
) {
  const hostname = stripAddressBrackets(rawHostname).toLowerCase();
  const addresses = isIP(hostname) ? [hostname] : await resolver(hostname);
  const publicAddresses = [
    ...new Set(
      addresses
        .map((address) => stripAddressBrackets(address).toLowerCase())
        .filter((address) => isIP(address) !== 0 && !isBlockedAddress(address)),
    ),
  ].sort();
  if (publicAddresses.length === 0) {
    throw new Error("MCP endpoint did not resolve to a public address");
  }
  return publicAddresses[0]!;
}

export function buildPinnedMcpRequestOptions(
  input: {
    body: string | null;
    headers: Record<string, string>;
    method: string;
    url: string;
  },
  pinnedAddress: string,
): https.RequestOptions {
  const url = new URL(input.url);
  if (url.protocol !== "https:")
    throw new Error("MCP endpoints must use HTTPS");
  const hostname = stripAddressBrackets(url.hostname);
  return {
    agent: false,
    headers: { ...input.headers, host: url.host },
    hostname: pinnedAddress,
    method: input.method,
    path: `${url.pathname}${url.search}`,
    port: url.port ? Number(url.port) : 443,
    rejectUnauthorized: true,
    ...(isIP(hostname) === 0 ? { servername: hostname } : {}),
  };
}

export function isPinnedMcpRemoteAddress(
  remoteAddress: string,
  pinnedAddress: string,
) {
  return (
    normalizeSocketAddress(remoteAddress) ===
    normalizeSocketAddress(pinnedAddress)
  );
}

async function resolveSystemAddresses(hostname: string) {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.map((address) => address.address);
}

function normalizeSocketAddress(address: string) {
  const normalized = stripAddressBrackets(address.toLowerCase()).replace(
    /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/,
    "$1",
  );
  if (isIP(normalized) !== 6) return normalized;
  return new URL(`http://[${normalized}]/`).hostname.slice(1, -1);
}

function stripAddressBrackets(value: string) {
  return value.replace(/^\[|\]$/g, "");
}

function abortReason(signal: AbortSignal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Aborted", "AbortError");
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortReason(signal));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}
