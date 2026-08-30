const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"])
const MAX_TOKEN_BYTES = 16 * 1024

type GoogleIdClaims = {
  aud?: string | string[]
  email?: string
  email_verified?: boolean
  exp?: number
  iss?: string
  sub?: string
}

type GoogleJwk = JsonWebKey & { kid?: string }

let keyCache: { expiresAt: number; keys: GoogleJwk[] } | null = null

export async function verifyGoogleIdToken(
  token: string,
  audience: string,
  fetcher: typeof fetch = fetch,
) {
  if (!token || token.length > MAX_TOKEN_BYTES) {
    throw new Error("Google returned an invalid identity token.")
  }
  const parts = token.split(".")
  if (parts.length !== 3) throw new Error("Google returned an invalid identity token.")
  const header = parseTokenPart<{ alg?: string; kid?: string }>(parts[0]!)
  const claims = parseTokenPart<GoogleIdClaims>(parts[1]!)
  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Google returned an unsupported identity token.")
  }

  const key = (await getGoogleKeys(fetcher)).find((item) => item.kid === header.kid)
  if (!key) throw new Error("Google identity signing key is unavailable.")
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    key,
    { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["verify"],
  )
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    base64UrlToBytes(parts[2]!),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  )
  const now = Math.floor(Date.now() / 1000)
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (
    !valid ||
    !claims.iss ||
    !GOOGLE_ISSUERS.has(claims.iss) ||
    !audiences.includes(audience) ||
    typeof claims.exp !== "number" ||
    claims.exp <= now ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    typeof claims.email !== "string" ||
    claims.email_verified !== true
  ) {
    throw new Error("Google identity token validation failed.")
  }
  return {
    email: claims.email.toLowerCase(),
    subject: claims.sub,
  }
}

async function getGoogleKeys(fetcher: typeof fetch) {
  if (keyCache && keyCache.expiresAt > Date.now()) return keyCache.keys
  const response = await fetcher(GOOGLE_CERTS_URL, {
    headers: { accept: "application/json" },
  })
  if (!response.ok) throw new Error("Google identity signing keys are unavailable.")
  const body = (await response.json()) as { keys?: GoogleJwk[] }
  if (!Array.isArray(body.keys)) throw new Error("Google identity signing keys are invalid.")
  const maxAge = /max-age=(\d+)/i.exec(response.headers.get("cache-control") ?? "")
  const ttl = Math.min(Math.max(Number(maxAge?.[1] ?? 300), 60), 3_600)
  keyCache = { expiresAt: Date.now() + ttl * 1_000, keys: body.keys }
  return body.keys
}

function parseTokenPart<T>(value: string): T {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T
  } catch {
    throw new Error("Google returned an invalid identity token.")
  }
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}
