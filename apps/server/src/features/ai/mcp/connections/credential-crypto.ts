import { getRequiredStringEnv, type RuntimeEnv } from "../../../../shared/config/config";

type Keyring = { activeVersion: string; keys: Record<string, string> };

export type EncryptedMcpSecret = {
  authTag: string;
  ciphertext: string;
  iv: string;
  keyVersion: string;
};

export function mcpSecretAad(input: {
  authenticatedByUserId: string;
  connectionId: string;
  keyVersion: string;
  profileId: string;
  purpose: string;
  workspaceId: string;
}) {
  return [
    "zilobase-mcp-v1",
    input.workspaceId,
    input.profileId,
    input.connectionId,
    input.authenticatedByUserId,
    input.purpose,
    input.keyVersion,
  ].join("\u001f");
}

export async function encryptMcpSecret(
  env: RuntimeEnv,
  plaintext: string,
  context: Omit<Parameters<typeof mcpSecretAad>[0], "keyVersion">,
): Promise<EncryptedMcpSecret> {
  const keyring = readKeyring(env);
  const keyVersion = keyring.activeVersion;
  const key = await importKey(keyring.keys[keyVersion]!, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        additionalData: new TextEncoder().encode(mcpSecretAad({ ...context, keyVersion })),
        iv,
        name: "AES-GCM",
        tagLength: 128,
      },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  const tag = encrypted.slice(-16);
  const ciphertext = encrypted.slice(0, -16);
  return {
    authTag: toBase64(tag),
    ciphertext: toBase64(ciphertext),
    iv: toBase64(iv),
    keyVersion,
  };
}

export async function decryptMcpSecret(
  env: RuntimeEnv,
  encrypted: EncryptedMcpSecret,
  context: Omit<Parameters<typeof mcpSecretAad>[0], "keyVersion">,
) {
  const keyring = readKeyring(env);
  const encodedKey = keyring.keys[encrypted.keyVersion];
  if (!encodedKey) throw new Error("MCP credential key version is unavailable.");
  const key = await importKey(encodedKey, ["decrypt"]);
  const ciphertext = fromBase64(encrypted.ciphertext);
  const tag = fromBase64(encrypted.authTag);
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext);
  combined.set(tag, ciphertext.length);
  const plaintext = await crypto.subtle.decrypt(
    {
      additionalData: new TextEncoder().encode(
        mcpSecretAad({
          ...context,
          keyVersion: encrypted.keyVersion,
        }),
      ),
      iv: fromBase64(encrypted.iv),
      name: "AES-GCM",
      tagLength: 128,
    },
    key,
    combined,
  );
  return new TextDecoder().decode(plaintext);
}

function readKeyring(env: RuntimeEnv): Keyring {
  let parsed: unknown;
  try {
    parsed = JSON.parse(getRequiredStringEnv(env, "MCP_CREDENTIAL_ENCRYPTION_KEYS"));
  } catch {
    throw new Error("MCP_CREDENTIAL_ENCRYPTION_KEYS must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("MCP credential keyring is invalid.");
  }
  const value = parsed as { activeVersion?: unknown; keys?: unknown };
  if (typeof value.activeVersion !== "string" || !value.keys || typeof value.keys !== "object") {
    throw new Error("MCP credential keyring is invalid.");
  }
  const keys = value.keys as Record<string, unknown>;
  if (typeof keys[value.activeVersion] !== "string") {
    throw new Error("MCP active credential key is missing.");
  }
  for (const encoded of Object.values(keys)) {
    if (typeof encoded !== "string" || fromBase64(encoded).length !== 32) {
      throw new Error("Every MCP credential key must be a base64-encoded 32-byte key.");
    }
  }
  return { activeVersion: value.activeVersion, keys: keys as Record<string, string> };
}

async function importKey(encoded: string, usages: KeyUsage[]) {
  return crypto.subtle.importKey("raw", fromBase64(encoded), "AES-GCM", false, usages);
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
