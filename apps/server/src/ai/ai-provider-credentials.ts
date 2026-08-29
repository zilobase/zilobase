import { getStringEnv, type RuntimeEnv } from "../shared/config/config";

const CREDENTIAL_KEY_VERSION = "v1";
const AES_GCM_IV_BYTES = 12;

export type EncryptedAiProviderCredential = {
  ciphertext: string;
  fingerprint: string;
  iv: string;
  keyVersion: string;
};

export class AiProviderCredentialError extends Error {
  readonly status: number;

  constructor(message: string, status = 503) {
    super(message);
    this.name = "AiProviderCredentialError";
    this.status = status;
  }
}

export async function encryptAiProviderCredential(
  env: RuntimeEnv,
  value: string,
): Promise<EncryptedAiProviderCredential> {
  const normalized = normalizeCredential(value);
  if (!normalized) {
    throw new AiProviderCredentialError("An AI provider credential is required.", 400);
  }

  const key = await importCredentialKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(normalized),
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    fingerprint: (await sha256Hex(normalized)).slice(0, 16),
    iv: bytesToBase64(iv),
    keyVersion: CREDENTIAL_KEY_VERSION,
  };
}

export async function decryptAiProviderCredential(
  env: RuntimeEnv,
  encrypted: EncryptedAiProviderCredential,
) {
  if (encrypted.keyVersion !== CREDENTIAL_KEY_VERSION) {
    throw new AiProviderCredentialError(
      `Unsupported AI credential key version: ${encrypted.keyVersion}`,
    );
  }

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(encrypted.iv) },
      await importCredentialKey(env),
      base64ToBytes(encrypted.ciphertext),
    );
    return normalizeCredential(new TextDecoder().decode(plaintext));
  } catch {
    throw new AiProviderCredentialError(
      "The workspace AI credential could not be decrypted. Rotate it before continuing.",
    );
  }
}

export function readEncryptedAiProviderCredential(value: {
  credentialCiphertext?: string | null;
  credentialFingerprint?: string | null;
  credentialIv?: string | null;
  credentialKeyVersion?: string | null;
}): EncryptedAiProviderCredential | null {
  if (
    !value.credentialCiphertext ||
    !value.credentialFingerprint ||
    !value.credentialIv ||
    !value.credentialKeyVersion
  ) {
    return null;
  }

  return {
    ciphertext: value.credentialCiphertext,
    fingerprint: value.credentialFingerprint,
    iv: value.credentialIv,
    keyVersion: value.credentialKeyVersion,
  };
}

function normalizeCredential(value: string) {
  return value.trim().replace(/^Bearer(?:\s+|$)/i, "");
}

async function importCredentialKey(env: RuntimeEnv) {
  const encoded = getStringEnv(env, "AI_PROVIDER_CREDENTIAL_ENCRYPTION_KEY")?.trim();
  if (!encoded) {
    throw new AiProviderCredentialError(
      "AI_PROVIDER_CREDENTIAL_ENCRYPTION_KEY is required for workspace BYOK credentials.",
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(encoded);
  } catch {
    throw new AiProviderCredentialError(
      "AI_PROVIDER_CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
    );
  }
  if (bytes.byteLength !== 32) {
    throw new AiProviderCredentialError(
      "AI_PROVIDER_CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes.",
    );
  }

  return crypto.subtle.importKey("raw", toArrayBuffer(bytes), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
