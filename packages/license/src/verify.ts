import { createPublicKey, verify as edVerify } from "node:crypto";

import { fromBase64Url } from "./encode.ts";
import { EMBEDDED_PUBLIC_KEY } from "./keys.ts";
import type { LicensePayload } from "./payload.ts";

export class LicenseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LicenseError";
  }
}

export interface VerifyOptions {
  /** Override the embedded public key (used in tests). */
  readonly publicKeyPem?: string;
  /** Current time (epoch ms); defaults to `Date.now()`. */
  readonly now?: number;
}

/**
 * Verify a license token's signature and expiry offline (no network), and
 * return its payload. Throws `LicenseError` on any problem. Air-gap safe: the
 * only input is the embedded public key.
 */
export function verifyLicense(token: string, options: VerifyOptions = {}): LicensePayload {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new LicenseError("Malformed license token.");
  }
  const [body, signature] = parts;

  let valid: boolean;
  try {
    valid = edVerify(
      null,
      Buffer.from(body),
      createPublicKey(options.publicKeyPem ?? EMBEDDED_PUBLIC_KEY),
      fromBase64Url(signature),
    );
  } catch {
    throw new LicenseError("Invalid license signature.");
  }
  if (!valid) throw new LicenseError("Invalid license signature.");

  let payload: LicensePayload;
  try {
    payload = JSON.parse(fromBase64Url(body).toString("utf8")) as LicensePayload;
  } catch {
    throw new LicenseError("Unreadable license payload.");
  }

  const now = options.now ?? Date.now();
  if (payload.expiresAt !== null && now > payload.expiresAt) {
    throw new LicenseError("License expired.");
  }
  return payload;
}
