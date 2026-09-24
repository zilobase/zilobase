import { Buffer } from "node:buffer";
import { getStringEnv, type RuntimeEnv } from "../../../shared/config/config";

const CALENDAR_CREDENTIAL_KEY_VERSION = "v1";
const AES_GCM_IV_BYTES = 12;

export type CalendarSecretContext = {
  connectionId: string;
  purpose: "oauth_verifier" | "refresh_token";
  userId: string;
};

export type EncryptedCalendarSecret = {
  ciphertext: string;
  iv: string;
  keyVersion: string;
};

export class CalendarCredentialError extends Error {
  readonly status: number;

  constructor(message: string, status = 503) {
    super(message);
    this.name = "CalendarCredentialError";
    this.status = status;
  }
}

export async function encryptCalendarSecret(
  env: RuntimeEnv,
  value: string,
  context: CalendarSecretContext,
): Promise<EncryptedCalendarSecret> {
  if (!value) throw new CalendarCredentialError("A calendar credential is required.", 400);
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    {
      additionalData: new TextEncoder().encode(contextAad(context)),
      iv,
      name: "AES-GCM",
    },
    await importCredentialKey(env),
    new TextEncoder().encode(value),
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
    keyVersion: CALENDAR_CREDENTIAL_KEY_VERSION,
  };
}

export async function decryptCalendarSecret(
  env: RuntimeEnv,
  encrypted: EncryptedCalendarSecret,
  context: CalendarSecretContext,
) {
  if (encrypted.keyVersion !== CALENDAR_CREDENTIAL_KEY_VERSION) {
    throw new CalendarCredentialError(
      `Unsupported calendar credential key version: ${encrypted.keyVersion}`,
    );
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
    );
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    if (error instanceof CalendarCredentialError) throw error;
    throw new CalendarCredentialError(
      "The Gcalendar credential could not be decrypted. Reconnect the account.",
    );
  }
}

function contextAad(context: CalendarSecretContext) {
  const connectionId = requireContextValue(context.connectionId);
  const userId = requireContextValue(context.userId);
  return `zilobase:calendar:${CALENDAR_CREDENTIAL_KEY_VERSION}:${context.purpose}:${userId}:${connectionId}`;
}

function requireContextValue(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 512 || normalized.includes("\0")) {
    throw new CalendarCredentialError("The calendar credential context is invalid.", 400);
  }
  return normalized;
}

async function importCredentialKey(env: RuntimeEnv) {
  const encoded = getStringEnv(env, "CALENDAR_TOKEN_ENCRYPTION_KEY")?.trim();
  if (!encoded) {
    throw new CalendarCredentialError(
      "CALENDAR_TOKEN_ENCRYPTION_KEY is required for Gcalendar connections.",
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(encoded);
  } catch {
    throw invalidKeyError();
  }
  if (bytes.byteLength !== 32) throw invalidKeyError();

  return crypto.subtle.importKey("raw", toArrayBuffer(bytes), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

function invalidKeyError() {
  return new CalendarCredentialError(
    "CALENDAR_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
  );
}

function toArrayBuffer(bytes: Uint8Array) {
  return Uint8Array.from(bytes).buffer;
}
function bytesToBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}
function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
