import { getStringEnv, type RuntimeEnv } from "../../../shared/config/config";

const KEY_VERSION = "v1";

export async function encryptAutomationSecret(
  env: RuntimeEnv,
  value: string,
  context: { ownerUserId: string; purpose: string; secretId: string; workspaceId: string },
) {
  if (!value || value.length > 16_384 || /[\r\n\0]/.test(value)) {
    throw new Error("Automation secret is empty, too large, or contains control characters");
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { additionalData: aad(context), iv, name: "AES-GCM" },
    await key(env),
    new TextEncoder().encode(value),
  );
  return { ciphertext: encode(new Uint8Array(ciphertext)), iv: encode(iv), keyVersion: KEY_VERSION };
}

export async function decryptAutomationSecret(
  env: RuntimeEnv,
  encrypted: { ciphertext: string; iv: string; keyVersion: string },
  context: { ownerUserId: string; purpose: string; secretId: string; workspaceId: string },
) {
  if (encrypted.keyVersion !== KEY_VERSION) throw new Error("Unsupported automation secret key version");
  const plaintext = await crypto.subtle.decrypt(
    { additionalData: aad(context), iv: decode(encrypted.iv), name: "AES-GCM" },
    await key(env),
    decode(encrypted.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

function aad(context: { ownerUserId: string; purpose: string; secretId: string; workspaceId: string }) {
  return new TextEncoder().encode(
    `zilobase:automation-secret:${KEY_VERSION}:${context.workspaceId}:${context.ownerUserId}:${context.secretId}:${context.purpose}`,
  );
}

async function key(env: RuntimeEnv) {
  const value = getStringEnv(env, "AUTOMATION_SECRET_ENCRYPTION_KEY")?.trim();
  if (!value) throw new Error("AUTOMATION_SECRET_ENCRYPTION_KEY is required");
  const bytes = decode(value);
  if (bytes.byteLength !== 32) throw new Error("AUTOMATION_SECRET_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
