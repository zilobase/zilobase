import { getStringEnv, type RuntimeEnv } from "../../../shared/config/config"

const MAIL_CREDENTIAL_KEY_VERSION = "v1"
const AES_GCM_IV_BYTES = 12

export type MailSecretContext = {
  connectionId: string
  purpose: "oauth_verifier" | "refresh_token"
  userId: string
}

export type EncryptedMailSecret = {
  ciphertext: string
  iv: string
  keyVersion: string
}

export class MailCredentialError extends Error {
  readonly status: number

  constructor(message: string, status = 503) {
    super(message)
    this.name = "MailCredentialError"
    this.status = status
  }
}

export async function encryptMailSecret(
  env: RuntimeEnv,
  value: string,
  context: MailSecretContext,
): Promise<EncryptedMailSecret> {
  if (!value) throw new MailCredentialError("A mail credential is required.", 400)
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES))
  const ciphertext = await crypto.subtle.encrypt(
    {
      additionalData: new TextEncoder().encode(contextAad(context)),
      iv,
      name: "AES-GCM",
    },
    await importCredentialKey(env),
    new TextEncoder().encode(value),
  )
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
    keyVersion: MAIL_CREDENTIAL_KEY_VERSION,
  }
}

export async function decryptMailSecret(
  env: RuntimeEnv,
  encrypted: EncryptedMailSecret,
  context: MailSecretContext,
) {
  if (encrypted.keyVersion !== MAIL_CREDENTIAL_KEY_VERSION) {
    throw new MailCredentialError(
      `Unsupported mail credential key version: ${encrypted.keyVersion}`,
    )
  }

  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        additionalData: new TextEncoder().encode(contextAad(context)),
        iv: base64ToBytes(encrypted.iv),
        name: "AES-GCM",
      },
      await importCredentialKey(env),
      base64ToBytes(encrypted.ciphertext),
    )
    return new TextDecoder().decode(plaintext)
  } catch (error) {
    if (error instanceof MailCredentialError) throw error
    throw new MailCredentialError(
      "The Gmail credential could not be decrypted. Reconnect the account.",
    )
  }
}

function contextAad(context: MailSecretContext) {
  const connectionId = requireContextValue(context.connectionId)
  const userId = requireContextValue(context.userId)
  return `zilobase:mail:${MAIL_CREDENTIAL_KEY_VERSION}:${context.purpose}:${userId}:${connectionId}`
}

function requireContextValue(value: string) {
  const normalized = value.trim()
  if (!normalized || normalized.length > 512 || normalized.includes("\0")) {
    throw new MailCredentialError("The mail credential context is invalid.", 400)
  }
  return normalized
}

async function importCredentialKey(env: RuntimeEnv) {
  const encoded = getStringEnv(env, "GMAIL_TOKEN_ENCRYPTION_KEY")?.trim()
  if (!encoded) {
    throw new MailCredentialError(
      "GMAIL_TOKEN_ENCRYPTION_KEY is required for Gmail connections.",
    )
  }

  let bytes: Uint8Array
  try {
    bytes = base64ToBytes(encoded)
  } catch {
    throw invalidKeyError()
  }
  if (bytes.byteLength !== 32) throw invalidKeyError()

  return crypto.subtle.importKey(
    "raw",
    toArrayBuffer(bytes),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  )
}

function invalidKeyError() {
  return new MailCredentialError(
    "GMAIL_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
  )
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}
