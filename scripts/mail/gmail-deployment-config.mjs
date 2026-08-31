const OAUTH_NAMES = [
  "GMAIL_GOOGLE_CLIENT_ID",
  "GMAIL_GOOGLE_CLIENT_SECRET",
  "GMAIL_TOKEN_ENCRYPTION_KEY",
]

const PUSH_NAMES = [
  "GMAIL_PUBSUB_TOPIC",
  "GMAIL_PUBSUB_PUSH_AUDIENCE",
  "GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL",
  "GMAIL_PUBSUB_SUBSCRIPTION",
]

const GMAIL_DEPLOYMENT_NAMES = [...OAUTH_NAMES, ...PUSH_NAMES]

export function validateGmailDeploymentConfig(input) {
  const values = Object.fromEntries(
    GMAIL_DEPLOYMENT_NAMES.map((name) => [name, stringValue(input[name])]),
  )
  const configured = GMAIL_DEPLOYMENT_NAMES.filter((name) => values[name])
  if (configured.length === 0) return { enabled: false }

  requireComplete(values, OAUTH_NAMES, "Gmail OAuth")

  const apiOrigin = canonicalApiOrigin(input.BETTER_AUTH_URL)
  const callbackUrl = `${apiOrigin}/mail/oauth/google/callback`
  const webhookUrl = `${apiOrigin}/mail/google/pubsub`

  if (!/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(values.GMAIL_GOOGLE_CLIENT_ID)) {
    throw new Error("GMAIL_GOOGLE_CLIENT_ID must be a Google OAuth client ID.")
  }
  if (!isBase64Key(values.GMAIL_TOKEN_ENCRYPTION_KEY)) {
    throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.")
  }

  const pushConfigured = PUSH_NAMES.some((name) => values[name])
  if (!pushConfigured && new URL(apiOrigin).protocol === "https:") {
    throw new Error("Production Gmail requires the complete Pub/Sub push configuration.")
  }
  if (pushConfigured) validatePush(values, webhookUrl)

  return { callbackUrl, enabled: true, pushEnabled: pushConfigured, webhookUrl }
}

function validatePush(values, webhookUrl) {
  requireComplete(values, PUSH_NAMES, "Gmail Pub/Sub")
  if (!/^projects\/[a-z][a-z0-9-]{4,28}[a-z0-9]\/topics\/[A-Za-z][A-Za-z0-9._~-]{2,254}$/.test(values.GMAIL_PUBSUB_TOPIC)) {
    throw new Error("GMAIL_PUBSUB_TOPIC must be a full Google Pub/Sub topic resource name.")
  }
  if (!/^projects\/[a-z][a-z0-9-]{4,28}[a-z0-9]\/subscriptions\/[A-Za-z][A-Za-z0-9._~-]{2,254}$/.test(values.GMAIL_PUBSUB_SUBSCRIPTION)) {
    throw new Error("GMAIL_PUBSUB_SUBSCRIPTION must be a full Google Pub/Sub subscription resource name.")
  }
  if (!/^[a-z0-9][a-z0-9._-]*@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(values.GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL)) {
    throw new Error("GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL must be a Google service-account email.")
  }
  if (values.GMAIL_PUBSUB_PUSH_AUDIENCE !== webhookUrl) {
    throw new Error(`GMAIL_PUBSUB_PUSH_AUDIENCE must exactly equal ${webhookUrl}.`)
  }
}

function canonicalApiOrigin(value) {
  let url
  try {
    url = new URL(stringValue(value))
  } catch {
    throw new Error("BETTER_AUTH_URL must be configured before Gmail.")
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]"
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("BETTER_AUTH_URL must be an HTTPS origin or a loopback HTTP origin.")
  }
  return url.origin
}

function isBase64Key(value) {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return false
  return Buffer.from(value, "base64").byteLength === 32
}

function requireComplete(values, names, label) {
  const missing = names.filter((name) => !values[name])
  if (missing.length > 0) throw new Error(`${label} configuration is incomplete: missing ${missing.join(", ")}.`)
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : ""
}
