import { createPrivateKey, sign as edSign } from "node:crypto";

import { toBase64Url } from "./encode.ts";
import type { LicensePayload } from "./payload.ts";

/**
 * Sign a license payload with the issuer's Ed25519 private key, producing a
 * compact `<base64url(payload)>.<base64url(signature)>` token.
 *
 * This is used ONLY by the private license-generator tool. It is exported from
 * the package for tests and tooling; shipping runtimes only ever verify.
 */
export function signLicense(payload: LicensePayload, privateKeyPem: string): string {
  const body = toBase64Url(JSON.stringify(payload));
  const signature = edSign(null, Buffer.from(body), createPrivateKey(privateKeyPem));
  return `${body}.${toBase64Url(signature)}`;
}
