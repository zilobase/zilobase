const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"])
const MAX_TOKEN_BYTES = 16 * 1024

type Claims = {
  aud?: string | string[]
  email?: string
  email_verified?: boolean
  exp?: number
  iss?: string
  sub?: string
}

type GoogleJwk = JsonWebKey & { kid?: string }
let cache: { expiresAt: number; keys: GoogleJwk[] } | null = null

export async function verifyGoogleOidcToken(
  token: string,
  input: { audience: string; email: string },
  fetcher: typeof fetch = fetch,
) {
  if (!token || token.length > MAX_TOKEN_BYTES) throw invalidToken()
  const parts = token.split(".")
  if (parts.length !== 3) throw invalidToken()
  const header = parsePart<{ alg?: string; kid?: string }>(parts[0]!)
  const claims = parsePart<Claims>(parts[1]!)
  if (header.alg !== "RS256" || !header.kid) throw invalidToken()
  const jwk = (await googleKeys(fetcher)).find((key) => key.kid === header.kid)
  if (!jwk) throw invalidToken()
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["verify"],
  )
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decode(parts[2]!),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  )
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (
    !valid ||
    !claims.iss ||
    !GOOGLE_ISSUERS.has(claims.iss) ||
    !audiences.includes(input.audience) ||
    typeof claims.exp !== "number" ||
    claims.exp <= Math.floor(Date.now() / 1000) ||
    claims.email_verified !== true ||
    claims.email?.toLowerCase() !== input.email.toLowerCase() ||
    !claims.sub
  ) throw invalidToken()
  return { email: claims.email.toLowerCase(), subject: claims.sub }
}

async function googleKeys(fetcher: typeof fetch) {
  if (cache && cache.expiresAt > Date.now()) return cache.keys
  const response = await fetcher(GOOGLE_CERTS_URL, { headers: { accept: "application/json" } })
  if (!response.ok) throw invalidToken()
  const body = (await response.json()) as { keys?: GoogleJwk[] }
  if (!Array.isArray(body.keys)) throw invalidToken()
  const maxAge = /max-age=(\d+)/i.exec(response.headers.get("cache-control") ?? "")
  const ttl = Math.min(Math.max(Number(maxAge?.[1] ?? 300), 60), 3_600)
  cache = { expiresAt: Date.now() + ttl * 1_000, keys: body.keys }
  return body.keys
}

function parsePart<T>(part: string): T {
  try {
    return JSON.parse(new TextDecoder().decode(decode(part))) as T
  } catch {
    throw invalidToken()
  }
}

function decode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function invalidToken() {
  return new Error("Google push authentication failed.")
}
