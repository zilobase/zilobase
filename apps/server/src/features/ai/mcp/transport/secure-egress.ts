import type { FetchLike } from "@modelcontextprotocol/client";

import { fetchMcpRequest } from "../../../../infrastructure/runtime/runtime-adapter";
import { isBlockedAddress } from "../../../automations/actions/webhook-egress";
import { MCP_LIMITS } from "../connections/config";

const MAX_MCP_REQUEST_BYTES = 1024 * 1024;

const BLOCKED_CUSTOM_HEADERS = new Set([
  "connection", "content-length", "cookie", "forwarded", "host", "keep-alive",
  "proxy-authenticate", "proxy-authorization", "te", "trailer",
  "transfer-encoding", "upgrade", "via", "x-forwarded-for", "x-forwarded-host",
  "x-forwarded-proto",
]);

export class McpEgressError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "McpEgressError";
  }
}

export function normalizeMcpEndpoint(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new McpEgressError("mcp_url_invalid", "MCP endpoint URL is invalid.");
  }
  if (url.protocol !== "https:") {
    throw new McpEgressError("mcp_https_required", "MCP endpoints must use HTTPS.");
  }
  if (url.username || url.password || url.hash || url.search) {
    throw new McpEgressError(
      "mcp_url_unsafe",
      "MCP endpoint URLs cannot contain credentials, query parameters, or fragments.",
    );
  }
  url.hostname = url.hostname.toLowerCase();
  if (url.port === "443") url.port = "";
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHostname(hostname) || isBlockedAddress(hostname)) {
    throw new McpEgressError("mcp_private_destination", "MCP destination is private or reserved.");
  }
  return url.toString();
}

export function validateMcpCustomHeaderName(name: string) {
  const normalized = name.trim().toLowerCase();
  if (
    !/^[!#$%&'*+.^_`|~0-9a-z-]{1,200}$/.test(normalized) ||
    BLOCKED_CUSTOM_HEADERS.has(normalized) ||
    normalized.startsWith("mcp-") ||
    normalized.startsWith("sec-")
  ) {
    throw new McpEgressError("mcp_header_invalid", "MCP header is reserved or invalid.");
  }
  return normalized;
}

export function createSecureMcpFetch(input: {
  approvedUrls: ReadonlySet<string>;
  allowAnyPublicHttps?: boolean;
  transport?: typeof fetchMcpRequest;
  timeoutMs?: number;
}): FetchLike {
  const approved = new Set([...input.approvedUrls].map(normalizeMcpEndpoint));
  const transport = input.transport ?? fetchMcpRequest;
  return async (requestInput, init) => {
    const request = new Request(requestInput, init);
    let currentUrl = normalizeMcpEndpoint(request.url);
    let method = request.method;
    let body = request.body ? await readBoundedRequestBody(request) : null;
    const headers = new Headers(request.headers);

    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
      if (!input.allowAnyPublicHttps && !approved.has(currentUrl)) {
        throw new McpEgressError("mcp_endpoint_not_approved", "MCP request target is not workspace-approved.");
      }
      const response = await transport({
        body,
        headers: Object.fromEntries(headers.entries()),
        method,
        signal: request.signal,
        timeoutMs: input.timeoutMs ?? MCP_LIMITS.timeoutMs,
        url: currentUrl,
      });
      if (response.status < 300 || response.status >= 400) {
        return boundMcpResponse(response);
      }
      // Redirect bodies are never consumed by the SDK. Release the connection
      // before validating/following the next hop, including rejected redirects.
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location || redirectCount === 3) {
        throw new McpEgressError("mcp_redirect_rejected", "MCP redirect was rejected.");
      }
      const previousOrigin = new URL(currentUrl).origin;
      const nextUrl = normalizeMcpEndpoint(new URL(location, currentUrl).toString());
      if (new URL(nextUrl).origin !== previousOrigin) {
        throw new McpEgressError("mcp_redirect_rejected", "Cross-origin MCP redirects are not allowed.");
      }
      currentUrl = nextUrl;
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
        method = "GET";
        body = null;
        headers.delete("content-type");
      }
    }
    throw new McpEgressError("mcp_redirect_rejected", "MCP redirect was rejected.");
  };
}

async function readBoundedRequestBody(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_MCP_REQUEST_BYTES) {
    throw new McpEgressError("mcp_request_too_large", "MCP request exceeded 1 MiB.");
  }
  const reader = request.body!.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > MAX_MCP_REQUEST_BYTES) {
      await reader.cancel();
      throw new McpEgressError("mcp_request_too_large", "MCP request exceeded 1 MiB.");
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function boundMcpResponse(response: Response) {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MCP_LIMITS.maxResponseBytes) {
    void response.body?.cancel().catch(() => {});
    throw new McpEgressError("mcp_response_too_large", "MCP response exceeded 5 MiB.");
  }
  if (!response.body) return response;
  let total = 0;
  const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      total += chunk.byteLength;
      if (total > MCP_LIMITS.maxResponseBytes) {
        controller.error(new McpEgressError("mcp_response_too_large", "MCP response exceeded 5 MiB."));
        return;
      }
      controller.enqueue(chunk);
    },
  }));
  return new Response(body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function isBlockedHostname(hostname: string) {
  const canonical = hostname.replace(/\.$/, "");
  return !canonical.includes(".") && !canonical.includes(":") ||
    canonical === "localhost" || canonical.endsWith(".localhost") ||
    canonical.endsWith(".local") || canonical.endsWith(".internal");
}
