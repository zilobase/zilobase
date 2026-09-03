import type { GmailMessage, GmailThread } from "./gmail-gateway"
import { requestSignal } from "../../shared/http/request"

const MAX_REDIRECTS = 5
const MAX_RESPONSE_BYTES = 128 * 1024

export class MailUnsubscribeError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 502) { super(message); this.name = "MailUnsubscribeError" }
}

export async function inspectOrExecuteUnsubscribe(thread: GmailThread, fetcher: typeof fetch = fetch) {
  const message = latestMessage(thread)
  const headers = new Map((message.payload?.headers ?? []).flatMap((header) => header.name && header.value !== undefined ? [[header.name.toLowerCase(), header.value] as const] : []))
  const candidates = parseUnsubscribeCandidates(headers.get("list-unsubscribe"))
  if (!candidates.length) throw new MailUnsubscribeError("This sender did not provide an unsubscribe address.", 404)
  const oneClick = headers.get("list-unsubscribe-post")?.toLowerCase().includes("list-unsubscribe=one-click") === true
  const https = candidates.find((candidate) => candidate.protocol === "https:")
  if (oneClick && https) {
    await safeFetchWithRedirects(https, fetcher)
    return { executed: true, fallback: null }
  }
  const fallback = candidates.find((candidate) => candidate.protocol === "https:" || candidate.protocol === "http:" || candidate.protocol === "mailto:")
  if (!fallback) throw new MailUnsubscribeError("This sender provided an unsupported unsubscribe address.", 400)
  if (fallback.protocol !== "mailto:") await assertPublicUrl(fallback, fetcher)
  return { executed: false, fallback: { kind: fallback.protocol === "mailto:" ? "mailto" as const : "browser" as const, url: fallback.toString() } }
}

export function parseUnsubscribeCandidates(value: string | undefined) {
  if (!value || value.length > 8_192) return []
  return [...value.matchAll(/<([^>]+)>/g)].flatMap((match): URL[] => {
    try {
      const url = new URL(match[1]!)
      return ["https:", "http:", "mailto:"].includes(url.protocol) ? [url] : []
    } catch { return [] }
  })
}

async function safeFetchWithRedirects(initial: URL, fetcher: typeof fetch) {
  let url = initial
  let method = "POST"
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicUrl(url, fetcher)
    const response = await fetcher(url, {
      body: method === "POST" ? "List-Unsubscribe=One-Click" : undefined,
      headers: method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : undefined,
      method,
      redirect: "manual",
      signal: requestSignal(10_000),
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location || redirect === MAX_REDIRECTS) throw new MailUnsubscribeError("The unsubscribe redirect was rejected.", 502)
      url = new URL(location, url)
      method = response.status === 303 ? "GET" : method
      continue
    }
    if (!response.ok) throw new MailUnsubscribeError("The sender rejected the unsubscribe request.", 502)
    const length = Number(response.headers.get("content-length") ?? 0)
    if (length > MAX_RESPONSE_BYTES) throw new MailUnsubscribeError("The unsubscribe response was too large.", 502)
    return
  }
}

export async function assertPublicUrl(url: URL, fetcher: typeof fetch) {
  if (url.username || url.password) throw new MailUnsubscribeError("Credentialed unsubscribe URLs are not allowed.", 400)
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new MailUnsubscribeError("The unsubscribe URL is invalid.", 400)
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (isPrivateHostname(hostname)) throw new MailUnsubscribeError("Private unsubscribe destinations are not allowed.", 400)
  if (!isIpAddress(hostname)) {
    for (const type of ["A", "AAAA"] as const) {
      const dns = await fetcher(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`, { headers: { accept: "application/dns-json" }, signal: requestSignal(5_000) })
      if (!dns.ok) throw new MailUnsubscribeError("The unsubscribe host could not be verified.", 502)
      const payload = await dns.json() as { Answer?: Array<{ data?: string }> }
      for (const answer of payload.Answer ?? []) if (answer.data && isPrivateHostname(answer.data)) throw new MailUnsubscribeError("Private unsubscribe destinations are not allowed.", 400)
    }
  }
}

function latestMessage(thread: GmailThread): GmailMessage {
  const message = [...thread.messages ?? []].sort((left, right) => Number(right.internalDate ?? 0) - Number(left.internalDate ?? 0))[0]
  if (!message) throw new MailUnsubscribeError("Mail thread not found.", 404)
  return message
}

function isIpAddress(value: string) { return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value) || value.includes(":") }
function isPrivateHostname(value: string) {
  if (["localhost", "0.0.0.0", "::", "::1"].includes(value) || value.endsWith(".localhost") || value.endsWith(".local") || value.endsWith(".internal")) return true
  const parts = value.split(".").map(Number)
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [a, b] = parts
    return a === 0 || a === 10 || a === 127 || a! >= 224 || a === 169 && b === 254 || a === 172 && b! >= 16 && b! <= 31 || a === 192 && b === 168 || a === 100 && b! >= 64 && b! <= 127
  }
  const ipv6 = value.toLowerCase()
  return ipv6.startsWith("fc") || ipv6.startsWith("fd") || ipv6.startsWith("fe8") || ipv6.startsWith("fe9") || ipv6.startsWith("fea") || ipv6.startsWith("feb") || ipv6.startsWith("::ffff:127.") || ipv6.startsWith("::ffff:10.") || ipv6.startsWith("::ffff:192.168.")
}
