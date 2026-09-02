import { fetchAutomationWebhook } from "../../../infrastructure/runtime/runtime-adapter";

const MAX_RESPONSE_BYTES = 1024 * 1024;
const TOTAL_TIMEOUT_MS = 10_000;
const reservedHeaders = new Set([
  "connection", "content-length", "content-type", "host", "keep-alive",
  "proxy-authenticate", "proxy-authorization", "te", "trailer",
  "transfer-encoding", "upgrade", "x-zilobase-action-id",
  "x-zilobase-delivery-id", "x-zilobase-run-id", "x-zilobase-schema-version",
]);

export class WebhookEgressError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable = false,
    readonly responseStatus: number | null = null,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "WebhookEgressError";
  }
}

export function validateWebhookHeaderName(name: string) {
  const normalized = name.trim().toLowerCase();
  if (!/^[!#$%&'*+.^_`|~0-9a-z-]{1,200}$/.test(normalized) || reservedHeaders.has(normalized)) {
    throw new WebhookEgressError("Webhook header is reserved or invalid", "AUTOMATION_WEBHOOK_HEADER_INVALID");
  }
  return normalized;
}

export async function resolvePublicWebhookTarget(
  rawUrl: string,
  options: {
    allowHttpDomains?: ReadonlySet<string>;
    resolver?: (hostname: string) => Promise<string[]>;
  } = {},
) {
  let url: URL;
  try { url = new URL(rawUrl); } catch {
    throw new WebhookEgressError("Webhook URL is invalid", "AUTOMATION_WEBHOOK_URL_INVALID");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (url.username || url.password || url.hash) {
    throw new WebhookEgressError("Credential-bearing or fragment webhook URLs are not allowed", "AUTOMATION_WEBHOOK_URL_INVALID");
  }
  if (url.protocol !== "https:") {
    if (url.protocol !== "http:" || !options.allowHttpDomains?.has(hostname)) {
      throw new WebhookEgressError("Webhook URLs must use HTTPS", "AUTOMATION_WEBHOOK_HTTPS_REQUIRED");
    }
  }
  if (isBlockedAddress(hostname) || isBlockedHostname(hostname)) {
    throw new WebhookEgressError("Webhook destination is private or reserved", "AUTOMATION_WEBHOOK_PRIVATE_DESTINATION");
  }
  const addresses = isIpAddress(hostname)
    ? [hostname]
    : await (options.resolver ?? resolveWithDoh)(hostname);
  const publicAddresses = [...new Set(addresses.map((address) => address.toLowerCase()))].sort();
  if (!publicAddresses.length) {
    throw new WebhookEgressError("Webhook host could not be resolved", "AUTOMATION_WEBHOOK_DNS_FAILED", true);
  }
  if (publicAddresses.some(isBlockedAddress)) {
    throw new WebhookEgressError("Webhook DNS resolved to a private or reserved address", "AUTOMATION_WEBHOOK_PRIVATE_DESTINATION");
  }
  return { pinnedAddress: publicAddresses[0]!, url };
}

export async function sendPinnedWebhook(input: {
  allowHttpDomains?: ReadonlySet<string>;
  body: string;
  headers: Record<string, string>;
  resolver?: (hostname: string) => Promise<string[]>;
  transport?: typeof fetchAutomationWebhook;
  url: string;
}) {
  const target = await resolvePublicWebhookTarget(input.url, {
    allowHttpDomains: input.allowHttpDomains,
    resolver: input.resolver,
  });
  let response: Response;
  try {
    response = await (input.transport ?? fetchAutomationWebhook)({
      body: input.body,
      headers: input.headers,
      pinnedAddress: target.pinnedAddress,
      timeoutMs: TOTAL_TIMEOUT_MS,
      url: target.url.toString(),
    });
  } catch (error) {
    throw new WebhookEgressError(
      error instanceof Error ? error.message : "Webhook network request failed",
      "AUTOMATION_WEBHOOK_NETWORK_FAILED",
      true,
    );
  }
  if (response.status >= 300 && response.status < 400) {
    throw new WebhookEgressError("Webhook redirects are not allowed", "AUTOMATION_WEBHOOK_REDIRECT_REJECTED", false, response.status);
  }
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new WebhookEgressError("Webhook response exceeded 1 MiB", "AUTOMATION_WEBHOOK_RESPONSE_TOO_LARGE", false, response.status);
  }
  await consumeBoundedBody(response);
  if (response.status >= 200 && response.status < 300) return { status: response.status };
  const retryable = [408, 409, 425, 429].includes(response.status) || response.status >= 500;
  throw new WebhookEgressError(
    `Webhook returned HTTP ${response.status}`,
    retryable ? "AUTOMATION_WEBHOOK_RETRYABLE_RESPONSE" : "AUTOMATION_WEBHOOK_TERMINAL_RESPONSE",
    retryable,
    response.status,
    retryable ? boundedRetryAfter(response.headers.get("retry-after")) : null,
  );
}

async function resolveWithDoh(hostname: string) {
  const addresses: string[] = [];
  for (const type of ["A", "AAAA"] as const) {
    const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new WebhookEgressError("Webhook DNS lookup failed", "AUTOMATION_WEBHOOK_DNS_FAILED", true);
    const payload = await response.json() as { Answer?: Array<{ data?: string; type?: number }> };
    for (const answer of payload.Answer ?? []) {
      if (answer.data && isIpAddress(answer.data)) addresses.push(answer.data.replace(/^\[|\]$/g, ""));
    }
  }
  return addresses;
}

async function consumeBoundedBody(response: Response) {
  if (!response.body) return;
  const reader = response.body.getReader();
  let total = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) return;
    total += chunk.value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new WebhookEgressError("Webhook response exceeded 1 MiB", "AUTOMATION_WEBHOOK_RESPONSE_TOO_LARGE", false, response.status);
    }
  }
}

function boundedRetryAfter(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(seconds * 1_000, 60 * 60_000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.min(date - Date.now(), 60 * 60_000)) : null;
}

function isIpAddress(value: string) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value) || value.includes(":");
}

function isBlockedHostname(hostname: string) {
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal");
}

export function isBlockedAddress(value: string) {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized.startsWith("::ffff:")) return isBlockedAddress(normalized.slice(7));
  const parts = normalized.split(".").map(Number);
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [a, b] = parts;
    return a === 0 || a === 10 || a === 127 || a! >= 224 ||
      a === 169 && b === 254 || a === 172 && b! >= 16 && b! <= 31 ||
      a === 192 && b === 168 || a === 100 && b! >= 64 && b! <= 127 ||
      a === 198 && (b === 18 || b === 19) || a === 192 && b === 0 ||
      a === 198 && b === 51 && parts[2] === 100 ||
      a === 203 && b === 0 && parts[2] === 113;
  }
  if (!normalized.includes(":")) return false;
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") ||
    normalized.startsWith("fd") || /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") || normalized.startsWith("2001:db8:");
}
