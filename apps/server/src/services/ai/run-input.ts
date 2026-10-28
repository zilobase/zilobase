import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { ProviderInput } from "./provider";
import { ServerOperationError } from "../operations/context";

function payloadKey(env: Record<string, unknown>) {
  const key = Buffer.from(String(env.AI_RUN_PAYLOAD_ENCRYPTION_KEY ?? ""), "base64");
  if (key.length !== 32)
    throw new ServerOperationError(
      { error: "AI_RUN_PAYLOAD_ENCRYPTION_KEY must be a base64 encoded 32 byte key" },
      503,
    );
  return key;
}
export function sealRunInput<T>(env: Record<string, unknown>, runId: string, input: T) {
  const value = Buffer.from(JSON.stringify(input));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", payloadKey(env), iv);
  cipher.setAAD(Buffer.from(runId));
  const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
export function openRunInput<T = ProviderInput>(
  env: Record<string, unknown>,
  runId: string,
  sealed: string,
): T {
  const bytes = Buffer.from(sealed, "base64");
  const cipher = createDecipheriv("aes-256-gcm", payloadKey(env), bytes.subarray(0, 12));
  cipher.setAAD(Buffer.from(runId));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString());
}
